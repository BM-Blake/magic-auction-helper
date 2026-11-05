"use strict";

const STORAGE_KEY = "magic-auction-items-v1";
const COUNT_LIMIT = 30;

const state = {
  data: null,
  board: null,
  selected: null,
  draft: emptyDraft()
};

const $ = (selector) => document.querySelector(selector);

document.addEventListener("DOMContentLoaded", init);

async function init() {
  bindStaticEvents();
  refreshNetwork();
  window.addEventListener("online", refreshNetwork);
  window.addEventListener("offline", refreshNetwork);

  try {
    const response = await fetch("data/auction.json");
    if (!response.ok) throw new Error("Auction data did not load.");
    state.data = await response.json();
  } catch (error) {
    $("#load-error").hidden = false;
    $("#load-error").textContent = "Could not load data/auction.json. The tracker needs that file beside this page.";
    $("#info-heading").closest("section").hidden = true;
    $("#fab").hidden = true;
    return;
  }

  $("#disclaimer").textContent = state.data.meta.estimateDisclaimer;
  state.board = loadBoard();
  buildHouseOptions();
  buildAddChoices();
  render();
  registerWorker();
}

function bindStaticEvents() {
  $("#house").addEventListener("change", onHouseChange);
  $("#end-game").addEventListener("click", endGame);
  $("#fab").addEventListener("click", () => setSheet($("#sheet").hidden));
  $("#close-sheet").addEventListener("click", () => setSheet(false));
  $("#sheet").addEventListener("submit", onAdd);
  $("#sheet").addEventListener("click", onDraftClick);
  $("#rarities").addEventListener("click", onSummaryClick);
  $("#types").addEventListener("click", onSummaryClick);
  $("#sizes").addEventListener("click", onSummaryClick);
  $("#detail-list").addEventListener("click", onDetailClick);
}

function emptyDraft() {
  return { rarity: "", type: "", size: "" };
}

function buildHouseOptions() {
  const house = $("#house");
  state.data.houses.forEach((entry) => {
    const option = document.createElement("option");
    option.value = entry.id;
    option.textContent = entry.name;
    house.appendChild(option);
  });
  if (!state.data.houses.some((entry) => entry.id === state.board.house)) {
    state.board.house = state.data.houses[0].id;
  }
  house.value = state.board.house;
}

function buildAddChoices() {
  state.data.rarities.forEach((rarity) => {
    $("#add-rarities").appendChild(choiceChip("rarity", rarity.id, rarity.name, rarity.color, rarity.ink));
  });
  state.data.types.forEach((type) => {
    $("#add-types").appendChild(choiceChip("type", type.id, type.name));
  });
  state.data.sizePresets.forEach((size) => {
    $("#add-sizes").appendChild(choiceChip("size", String(size), String(size)));
  });
}

function choiceChip(kind, id, label, color, ink) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "chip";
  button.dataset.pick = kind;
  button.dataset.id = id;
  button.textContent = label;
  button.setAttribute("aria-pressed", "false");
  if (color) {
    button.style.setProperty("--chip", color);
    button.style.setProperty("--chip-ink", ink);
  }
  return button;
}

function onHouseChange() {
  if (!state.board) return;
  state.board.house = $("#house").value;
  persist();
}

function setSheet(open) {
  $("#sheet").hidden = !open;
  $("#fab").textContent = open ? "×" : "+";
  $("#fab").setAttribute("aria-label", open ? "Close add form" : "Add a revealed treasure");
  if (open) $("#new-price").focus();
}

function onDraftClick(event) {
  const button = event.target.closest("[data-pick]");
  if (!button) return;
  const kind = button.dataset.pick;
  state.draft[kind] = state.draft[kind] === button.dataset.id ? "" : button.dataset.id;
  syncDraft();
  hideError();
}

function syncDraft() {
  document.querySelectorAll("[data-pick]").forEach((button) => {
    button.setAttribute("aria-pressed", state.draft[button.dataset.pick] === button.dataset.id ? "true" : "false");
  });
}

function onAdd(event) {
  event.preventDefault();
  const raw = $("#new-price").value;
  const price = parseCoins(raw);
  if (raw.trim() && Number.isNaN(price)) {
    showError("Enter a price like 120000, 120k, or 1.2m.");
    return;
  }
  if (!state.draft.rarity && !state.draft.type && !state.draft.size && price == null) {
    showError("Choose a rarity, type, size, or price.");
    return;
  }
  hideError();
  state.board.items.push({
    id: createId(),
    rarity: state.draft.rarity,
    type: state.draft.type,
    size: state.draft.size ? Number(state.draft.size) : null,
    price
  });
  state.draft = emptyDraft();
  $("#new-price").value = "";
  syncDraft();
  setSheet(false);
  persist();
  render();
}

function onSummaryClick(event) {
  const button = event.target.closest("[data-open]");
  if (!button || !state.board) return;
  const next = { kind: button.dataset.open, id: button.dataset.id };
  const same = state.selected && state.selected.kind === next.kind && state.selected.id === next.id;
  state.selected = same ? null : next;
  render();
}

function onDetailClick(event) {
  const button = event.target.closest("[data-remove]");
  if (!button) return;
  state.board.items = state.board.items.filter((item) => item.id !== button.dataset.remove);
  if (state.selected && !matchingItems().length) state.selected = null;
  persist();
  render();
}

function endGame() {
  if (!state.board) return;
  if (state.board.items.length && !window.confirm("End this game and clear the revealed information?")) return;
  state.board.items = [];
  state.selected = null;
  state.draft = emptyDraft();
  $("#new-price").value = "";
  syncDraft();
  hideError();
  setSheet(false);
  persist();
  render();
}

function render() {
  const counts = tally(state.board.items, state.data);
  renderGroup($("#rarities"), $("#rarity-group"), "rarities", state.data.rarities.map((entry) => ({
    id: entry.id,
    label: entry.name,
    count: counts.rarities[entry.id] || 0,
    color: entry.color,
    ink: entry.ink
  })));
  renderGroup($("#types"), $("#type-group"), "types", state.data.types.map((entry) => ({
    id: entry.id,
    label: entry.name,
    count: counts.types[entry.id] || 0
  })));
  renderGroup($("#sizes"), $("#size-group"), "sizes", state.data.sizePresets.map((size) => ({
    id: String(size),
    label: String(size),
    count: counts.sizes[String(size)] || 0
  })));
  $("#info-empty").hidden = state.board.items.length > 0;
  renderDetail();
  renderEstimate(counts);
  renderExact();
}

function renderGroup(container, fieldset, kind, entries) {
  container.replaceChildren();
  const visible = entries.filter((entry) => entry.count > 0);
  fieldset.hidden = visible.length === 0;
  visible.forEach((entry) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip is-on";
    button.dataset.open = kind;
    button.dataset.id = entry.id;
    const selected = state.selected && state.selected.kind === kind && state.selected.id === entry.id;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", selected ? "true" : "false");
    if (entry.color) {
      button.style.setProperty("--chip", entry.color);
      button.style.setProperty("--chip-ink", entry.ink);
    }
    const name = document.createElement("span");
    name.textContent = entry.label;
    const count = document.createElement("span");
    count.className = "count";
    count.textContent = String(entry.count);
    button.append(name, count);
    container.appendChild(button);
  });
}

function renderDetail() {
  const box = $("#detail");
  const items = matchingItems();
  if (!state.selected || !items.length) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  $("#detail-title").textContent = selectionLabel(state.selected);
  const list = $("#detail-list");
  list.replaceChildren();
  items.forEach((item) => {
    const row = document.createElement("li");
    row.className = "detail-item";
    const text = document.createElement("div");
    const title = document.createElement("p");
    title.textContent = itemSummary(item);
    const price = document.createElement("p");
    price.className = "detail-price";
    price.textContent = item.price == null ? "Price hidden" : `Exact ${formatCoins(item.price)}`;
    text.append(title, price);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "text-btn";
    remove.dataset.remove = item.id;
    remove.textContent = "Remove";
    row.append(text, remove);
    list.appendChild(row);
  });
}

function renderEstimate(counts) {
  const worth = estimateWorth(counts, state.data);
  $("#worth-range").textContent = !worth || worth.max === 0
    ? "0"
    : worth.min === worth.max
      ? formatCoins(worth.min)
      : `${formatCoins(worth.min)} – ${formatCoins(worth.max)}`;
}

function renderExact() {
  const total = state.board.items.reduce((sum, item) => sum + (item.price == null ? 0 : item.price), 0);
  $("#exact-total").textContent = formatCoins(total);
}

function matchingItems() {
  if (!state.selected) return [];
  return state.board.items.filter((item) => {
    if (state.selected.kind === "rarities") return item.rarity === state.selected.id;
    if (state.selected.kind === "types") return item.type === state.selected.id;
    return item.size != null && String(item.size) === state.selected.id;
  });
}

function selectionLabel(selected) {
  if (selected.kind === "rarities") return rarityName(selected.id);
  if (selected.kind === "types") return typeName(selected.id);
  return `${selected.id} tiles`;
}

function itemSummary(item) {
  const parts = [];
  if (item.rarity) parts.push(rarityName(item.rarity));
  if (item.type) parts.push(typeName(item.type));
  if (item.size != null) parts.push(`${item.size} tile${item.size === 1 ? "" : "s"}`);
  return parts.join(" · ") || "Revealed treasure";
}

function rarityName(id) {
  return state.data.rarities.find((entry) => entry.id === id)?.name || id;
}

function typeName(id) {
  return state.data.types.find((entry) => entry.id === id)?.name || id;
}

function tally(items, data) {
  const rarities = zeroMap(data.rarities);
  const types = zeroMap(data.types);
  const sizes = zeroSizes(data.sizePresets);
  items.forEach((item) => {
    if (item.rarity && Object.prototype.hasOwnProperty.call(rarities, item.rarity)) rarities[item.rarity] += 1;
    if (item.type && Object.prototype.hasOwnProperty.call(types, item.type)) types[item.type] += 1;
    if (item.size != null && Object.prototype.hasOwnProperty.call(sizes, String(item.size))) sizes[String(item.size)] += 1;
  });
  return { rarities, types, sizes };
}

function estimateWorth(board, data) {
  const rarities = expandCounts(board.rarities);
  if (!rarities.length) return { min: 0, max: 0 };

  const typeGroups = expandCounts(board.types)
    .map((id) => data.types.find((entry) => entry.id === id)?.group || null)
    .filter(Boolean);
  const sizes = expandCounts(board.sizes).map(Number);
  const slots = typeGroups.slice(0, rarities.length);
  while (slots.length < rarities.length) slots.push(null);

  const minMatrix = rarities.map((rarity) => slots.map((group) => boundsFor(rarity, group, data).min));
  const maxMatrix = rarities.map((rarity) => slots.map((group) => boundsFor(rarity, group, data).max));
  const minBases = assignValues(minMatrix, false);
  const maxBases = assignValues(maxMatrix, true);

  return tidyRange(
    applyScales(minBases, sizes, data, false),
    applyScales(maxBases, sizes, data, true)
  );
}

function boundsFor(rarity, group, data) {
  const rows = data.estimates.filter((entry) => entry.rarity === rarity && (!group || entry.group === group));
  return {
    min: Math.min(...rows.map((entry) => entry.min)),
    max: Math.max(...rows.map((entry) => entry.max))
  };
}

function assignValues(matrix, pickMax) {
  const count = matrix.length;
  if (count > 12) return greedyValues(matrix, pickMax);

  const full = (1 << count) - 1;
  const score = new Map([[0, 0]]);
  const choice = new Map();

  for (let mask = 0; mask <= full; mask += 1) {
    if (!score.has(mask)) continue;
    const row = bitCount(mask);
    if (row >= count) continue;
    for (let column = 0; column < count; column += 1) {
      if (mask & (1 << column)) continue;
      const nextMask = mask | (1 << column);
      const nextScore = score.get(mask) + matrix[row][column];
      if (!score.has(nextMask) || (pickMax ? nextScore > score.get(nextMask) : nextScore < score.get(nextMask))) {
        score.set(nextMask, nextScore);
        choice.set(nextMask, column);
      }
    }
  }

  const values = new Array(count);
  let mask = full;
  for (let row = count - 1; row >= 0; row -= 1) {
    const column = choice.get(mask);
    values[row] = matrix[row][column];
    mask ^= 1 << column;
  }
  return values;
}

function greedyValues(matrix, pickMax) {
  const used = new Array(matrix.length).fill(false);
  return matrix.map((row) => {
    let bestColumn = 0;
    let best = pickMax ? -Infinity : Infinity;
    row.forEach((value, column) => {
      if (used[column]) return;
      if (pickMax ? value > best : value < best) {
        best = value;
        bestColumn = column;
      }
    });
    used[bestColumn] = true;
    return best;
  });
}

function applyScales(bases, sizes, data, pickMax) {
  const scales = sizes.slice(0, bases.length).map((size) => scaleFor(size, data));
  if (sizes.length > bases.length) {
    const ranked = sizes
      .map((size) => scaleFor(size, data))
      .sort((a, b) => pickMax ? b.maxScale - a.maxScale : a.minScale - b.minScale);
    scales.splice(0, scales.length, ...ranked.slice(0, bases.length));
  }
  while (scales.length < bases.length) scales.push(scaleFor(null, data));

  const orderedBases = [...bases].sort((a, b) => b - a);
  const orderedScales = [...scales].sort((a, b) => {
    const left = pickMax ? a.maxScale : a.minScale;
    const right = pickMax ? b.maxScale : b.minScale;
    return pickMax ? right - left : left - right;
  });

  return orderedBases.reduce((sum, base, index) => {
    const scale = pickMax ? orderedScales[index].maxScale : orderedScales[index].minScale;
    return sum + base * scale;
  }, 0);
}

function scaleFor(size, data) {
  if (size == null) {
    return {
      minScale: Math.min(...data.sizeBands.map((band) => band.minScale)),
      maxScale: Math.max(...data.sizeBands.map((band) => band.maxScale))
    };
  }
  const band = data.sizeBands.find((entry) => size >= entry.minTiles && size <= entry.maxTiles);
  return band ? { minScale: band.minScale, maxScale: band.maxScale } : { minScale: 1, maxScale: 1 };
}

function expandCounts(counts) {
  const list = [];
  Object.entries(counts || {}).forEach(([id, count]) => {
    const total = Math.max(0, Math.min(COUNT_LIMIT, Number(count) || 0));
    for (let index = 0; index < total; index += 1) list.push(id);
  });
  return list;
}

function tidyRange(min, max) {
  const low = Math.floor(min / stepFor(min)) * stepFor(min);
  const high = Math.ceil(max / stepFor(max)) * stepFor(max);
  return { min: Math.max(0, low), max: Math.max(high, Math.max(0, low)) };
}

function stepFor(value) {
  if (value >= 1000000) return 50000;
  if (value >= 100000) return 10000;
  if (value >= 10000) return 1000;
  return 100;
}

function bitCount(value) {
  let count = 0;
  let bits = value;
  while (bits) {
    bits &= bits - 1;
    count += 1;
  }
  return count;
}

function parseCoins(raw) {
  if (raw == null) return null;
  const text = String(raw).trim().toLowerCase().replace(/,/g, "").replace(/\s+/g, "");
  if (!text) return null;
  const match = text.match(/^(\d+(\.\d+)?)([km])?$/);
  if (!match) return Number.NaN;
  let value = Number(match[1]);
  if (match[3] === "k") value *= 1000;
  if (match[3] === "m") value *= 1000000;
  if (!Number.isFinite(value) || value < 0 || value > 1000000000000) return Number.NaN;
  return Math.round(value);
}

function formatCoins(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function zeroMap(entries) {
  const map = {};
  entries.forEach((entry) => { map[entry.id] = 0; });
  return map;
}

function zeroSizes(presets) {
  const map = {};
  presets.forEach((size) => { map[String(size)] = 0; });
  return map;
}

function loadBoard() {
  const blank = { house: state.data.houses[0].id, items: [] };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!saved || typeof saved !== "object") return blank;
    const items = Array.isArray(saved.items) ? saved.items.filter(validItem) : [];
    return {
      house: typeof saved.house === "string" ? saved.house : blank.house,
      items
    };
  } catch (error) {
    return blank;
  }
}

function validItem(item) {
  return item && typeof item.id === "string";
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.board));
}

function createId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function showError(message) {
  const error = $("#form-error");
  error.hidden = false;
  error.textContent = message;
}

function hideError() {
  $("#form-error").hidden = true;
}

function refreshNetwork() {
  const network = $("#network");
  if (!network) return;
  network.hidden = navigator.onLine;
  network.textContent = "Offline. This page and auction.json are running from this device.";
}

function registerWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
