"use strict";

const STORAGE_KEY = "magic-auction-pool-v1";

const state = {
  data: null,
  items: [],
  editingId: null
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
    $("#form").hidden = true;
    return;
  }

  $("#disclaimer").textContent = state.data.meta.estimateDisclaimer;
  state.items = loadItems();
  buildChips();
  render();
  registerWorker();
}

function bindStaticEvents() {
  $("#form").addEventListener("submit", onSubmit);
  $("#cancel-edit").addEventListener("click", cancelEdit);
  $("#clear").addEventListener("click", clearAuction);
  $("#size").addEventListener("input", syncSizeChips);
  $("#rarities").addEventListener("click", (event) => toggleChip(event, "rarity"));
  $("#types").addEventListener("click", (event) => toggleChip(event, "type"));
  $("#sizes").addEventListener("click", onSizeChip);
  $("#list").addEventListener("click", onListClick);
}

function buildChips() {
  const rarities = $("#rarities");
  const types = $("#types");
  const sizes = $("#sizes");

  state.data.rarities.forEach((rarity) => {
    rarities.appendChild(makeChip(rarity.name, "rarity", rarity.id, rarity.color, rarity.ink));
  });

  state.data.types.forEach((type) => {
    types.appendChild(makeChip(type.name, "type", type.id));
  });

  state.data.sizePresets.forEach((size) => {
    sizes.appendChild(makeChip(String(size), "size", String(size)));
  });
}

function makeChip(label, kind, value, color, ink) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "chip";
  button.textContent = label;
  button.dataset[kind] = value;
  button.setAttribute("aria-pressed", "false");
  if (color) {
    button.style.setProperty("--chip", color);
    button.style.setProperty("--chip-ink", ink);
  }
  return button;
}

function toggleChip(event, kind) {
  const button = event.target.closest(`[data-${kind}]`);
  if (!button) return;
  const next = button.getAttribute("aria-pressed") !== "true";
  document.querySelectorAll(`[data-${kind}]`).forEach((chip) => chip.setAttribute("aria-pressed", "false"));
  button.setAttribute("aria-pressed", next ? "true" : "false");
  hideFormError();
}

function onSizeChip(event) {
  const button = event.target.closest("[data-size]");
  if (!button) return;
  const next = button.getAttribute("aria-pressed") !== "true";
  document.querySelectorAll("[data-size]").forEach((chip) => chip.setAttribute("aria-pressed", "false"));
  if (next) {
    button.setAttribute("aria-pressed", "true");
    $("#size").value = button.dataset.size;
  } else {
    $("#size").value = "";
  }
  hideFormError();
}

function syncSizeChips() {
  const value = $("#size").value.trim();
  document.querySelectorAll("[data-size]").forEach((chip) => {
    chip.setAttribute("aria-pressed", chip.dataset.size === value ? "true" : "false");
  });
}

function onSubmit(event) {
  event.preventDefault();
  const draft = readForm();
  const error = validate(draft);
  if (error) {
    showFormError(error);
    return;
  }

  if (state.editingId) {
    const index = state.items.findIndex((item) => item.id === state.editingId);
    if (index !== -1) state.items[index] = { id: state.editingId, ...draft };
  } else {
    state.items.push({ id: createId(), ...draft });
  }

  state.editingId = null;
  clearForm();
  persist();
  render();
}

function onListClick(event) {
  const edit = event.target.closest("[data-edit]");
  const remove = event.target.closest("[data-remove]");
  if (edit) startEdit(edit.dataset.edit);
  if (remove) removeItem(remove.dataset.remove);
}

function startEdit(id) {
  const item = state.items.find((entry) => entry.id === id);
  if (!item) return;
  state.editingId = id;
  setPressed("rarity", item.rarity);
  setPressed("type", item.type);
  $("#size").value = item.size == null ? "" : String(item.size);
  syncSizeChips();
  $("#price").value = item.price == null ? "" : formatCoins(item.price);
  $("#label").value = item.label;
  hideFormError();
  render();
  $("#form").scrollIntoView({ block: "center" });
}

function cancelEdit() {
  state.editingId = null;
  clearForm();
  render();
}

function removeItem(id) {
  state.items = state.items.filter((item) => item.id !== id);
  if (state.editingId === id) {
    state.editingId = null;
    clearForm();
  }
  persist();
  render();
}

function clearAuction() {
  if (!state.items.length) return;
  if (!window.confirm("Clear every treasure in this auction?")) return;
  state.items = [];
  state.editingId = null;
  clearForm();
  persist();
  render();
}

function readForm() {
  return {
    rarity: pressedValue("rarity"),
    type: pressedValue("type"),
    size: parseSize($("#size").value),
    price: parseCoins($("#price").value),
    label: $("#label").value.trim().slice(0, 40)
  };
}

function validate(draft) {
  const sizeText = $("#size").value.trim();
  const priceText = $("#price").value.trim();
  if (sizeText && Number.isNaN(draft.size)) return "Size is a tile count from 1 to 64.";
  if (priceText && Number.isNaN(draft.price)) return "Enter a price like 120000, 120k, or 1.2m.";
  if (!draft.rarity && !draft.type && draft.size == null && draft.price == null) {
    return "Add a rarity, type, size, or price.";
  }
  return "";
}

function render() {
  const editing = Boolean(state.editingId);
  $("#form-title").textContent = editing ? "Edit revealed treasure" : "Add a revealed treasure";
  $("#save").textContent = editing ? "Save changes" : "Add to pool";
  $("#cancel-edit").hidden = !editing;
  renderSummary();
  renderList();
}

function renderSummary() {
  const totals = summarize(state.items, state.data);
  const range = $("#worth-range");
  const detail = $("#worth-detail");

  if (!state.items.length) {
    range.textContent = "0";
    detail.textContent = "No treasures yet";
    return;
  }

  if (!totals.known) {
    range.textContent = "—";
    const verb = state.items.length === 1 ? "needs" : "need";
    detail.textContent = `${state.items.length} revealed still ${verb} a rarity or a price`;
    return;
  }

  range.textContent = totals.min === totals.max
    ? formatCoins(totals.min)
    : `${formatCoins(totals.min)} – ${formatCoins(totals.max)}`;

  const parts = [`${state.items.length} revealed`];
  if (totals.exactCount) parts.push(`${totals.exactCount} exact`);
  if (totals.approxCount) parts.push(`${totals.approxCount} approximate`);
  if (totals.unknown) parts.push(`${totals.unknown} unpriced`);
  detail.textContent = parts.join(" · ");
}

function renderList() {
  const list = $("#list");
  list.replaceChildren();
  $("#empty").hidden = state.items.length > 0;

  state.items.forEach((item) => {
    const worth = worthOf(item, state.data);
    const li = document.createElement("li");
    li.className = item.id === state.editingId ? "item is-editing" : "item";

    const rail = document.createElement("span");
    rail.className = "rail";
    rail.style.setProperty("--rarity", rarityColor(item.rarity));

    const body = document.createElement("div");
    const title = document.createElement("p");
    title.className = "item-title";
    title.textContent = itemTitle(item);
    body.append(title);

    const metaText = itemMeta(item);
    if (metaText) {
      const meta = document.createElement("p");
      meta.className = "item-meta";
      meta.textContent = metaText;
      body.append(meta);
    }

    const worthLine = document.createElement("p");
    worthLine.className = worth.kind === "exact" ? "item-worth exact" : "item-worth";
    worthLine.textContent = worthText(worth);
    body.append(worthLine);

    const note = gapNote(item, worth);
    if (note) {
      const noteLine = document.createElement("p");
      noteLine.className = "item-note";
      noteLine.textContent = note;
      body.append(noteLine);
    }

    const actions = document.createElement("div");
    actions.className = "item-actions";
    actions.append(actionButton("Edit", "edit", item.id), actionButton("Remove", "remove", item.id));
    body.append(actions);

    li.append(rail, body);
    list.append(li);
  });
}

function actionButton(label, action, id) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.dataset[action] = id;
  return button;
}

function summarize(items, data) {
  const totals = { min: 0, max: 0, exactCount: 0, approxCount: 0, unknown: 0, known: false };
  items.forEach((item) => {
    const worth = worthOf(item, data);
    if (worth.kind === "exact") {
      totals.min += worth.min;
      totals.max += worth.max;
      totals.exactCount += 1;
      totals.known = true;
    } else if (worth.kind === "approx") {
      totals.min += worth.min;
      totals.max += worth.max;
      totals.approxCount += 1;
      totals.known = true;
    } else {
      totals.unknown += 1;
    }
  });
  return totals;
}

function worthOf(item, data) {
  if (item.price != null) return { kind: "exact", min: item.price, max: item.price };

  if (!item.rarity) return { kind: "unknown" };

  const type = data.types.find((entry) => entry.id === item.type);
  const rows = data.estimates.filter((entry) => {
    return entry.rarity === item.rarity && (!type || entry.group === type.group);
  });
  if (!rows.length) return { kind: "unknown" };

  let min = Math.min(...rows.map((entry) => entry.min));
  let max = Math.max(...rows.map((entry) => entry.max));
  const band = item.size == null
    ? null
    : data.sizeBands.find((entry) => item.size >= entry.minTiles && item.size <= entry.maxTiles);

  if (band) {
    min *= band.minScale;
    max *= band.maxScale;
  } else if (item.size == null) {
    min *= Math.min(...data.sizeBands.map((entry) => entry.minScale));
    max *= Math.max(...data.sizeBands.map((entry) => entry.maxScale));
  }

  const tidy = tidyRange(min, max);
  return { kind: "approx", min: tidy.min, max: tidy.max };
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

function itemTitle(item) {
  if (item.label) return item.label;
  const rarity = rarityName(item.rarity);
  const type = typeName(item.type);
  return [rarity, type].filter(Boolean).join(" · ") || "Revealed treasure";
}

function itemMeta(item) {
  const parts = [];
  if (item.label) {
    const rarity = rarityName(item.rarity);
    const type = typeName(item.type);
    if (rarity) parts.push(rarity);
    if (type) parts.push(type);
  }
  if (item.size != null) parts.push(`${item.size} tile${item.size === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

function worthText(worth) {
  if (worth.kind === "exact") return `Exact ${formatCoins(worth.min)}`;
  if (worth.kind === "approx") {
    return worth.min === worth.max
      ? `Approx ${formatCoins(worth.min)}`
      : `Approx ${formatCoins(worth.min)} – ${formatCoins(worth.max)}`;
  }
  return "Needs a rarity or a price";
}

function gapNote(item, worth) {
  if (worth.kind !== "approx" || worth.max < worth.min * 4) return "";
  const missing = [];
  if (!item.type) missing.push("type");
  if (item.size == null) missing.push("size");
  if (!missing.length) return "";
  return `Wide range because ${missing.join(" and ")} ${missing.length === 1 ? "is" : "are"} still hidden.`;
}

function rarityName(id) {
  return state.data.rarities.find((entry) => entry.id === id)?.name || "";
}

function typeName(id) {
  return state.data.types.find((entry) => entry.id === id)?.name || "";
}

function rarityColor(id) {
  return state.data.rarities.find((entry) => entry.id === id)?.color || "";
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

function parseSize(raw) {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (!text) return null;
  if (!/^\d+$/.test(text)) return Number.NaN;
  const value = Number(text);
  if (value < 1 || value > 64) return Number.NaN;
  return value;
}

function formatCoins(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function countLabel(count, noun) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function pressedValue(kind) {
  return document.querySelector(`[data-${kind}][aria-pressed="true"]`)?.dataset[kind] || "";
}

function setPressed(kind, value) {
  document.querySelectorAll(`[data-${kind}]`).forEach((chip) => {
    chip.setAttribute("aria-pressed", chip.dataset[kind] === value ? "true" : "false");
  });
}

function clearForm() {
  setPressed("rarity", "");
  setPressed("type", "");
  setPressed("size", "");
  $("#size").value = "";
  $("#price").value = "";
  $("#label").value = "";
  hideFormError();
}

function showFormError(message) {
  const error = $("#form-error");
  error.hidden = false;
  error.textContent = message;
}

function hideFormError() {
  $("#form-error").hidden = true;
}

function loadItems() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!saved || !Array.isArray(saved.items)) return [];
    return saved.items.filter((item) => item && typeof item.id === "string");
  } catch (error) {
    return [];
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ items: state.items }));
}

function createId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
