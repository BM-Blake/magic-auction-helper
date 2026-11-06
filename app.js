"use strict";

const STORAGE_KEY = "magic-auction-items-v1";
const state = {
  data: null,
  board: null,
  selected: null,
  detailOpen: null,
  groups: [emptyGroup()]
};

const $ = (selector) => document.querySelector(selector);

document.addEventListener("DOMContentLoaded", init);

async function init() {
  bindStaticEvents();
  refreshNetwork();
  window.addEventListener("online", refreshNetwork);
  window.addEventListener("offline", refreshNetwork);

  try {
    const [auctionResponse, treasureResponse] = await Promise.all([
      fetch("data/auction.json?v=44"),
      fetch("data/treasures.json?v=44")
    ]);
    if (!auctionResponse.ok || !treasureResponse.ok) throw new Error("Auction data did not load.");
    state.data = await auctionResponse.json();
    state.data.treasures = await treasureResponse.json();
  } catch (error) {
    $("#load-error").hidden = false;
    $("#load-error").textContent = "Could not load the auction data. The tracker needs data/auction.json and data/treasures.json beside this page.";
    $("#info-heading").closest("section").hidden = true;
    $("#fab").hidden = true;
    return;
  }

  state.board = loadBoard();
  buildHouseOptions();
  renderGroups();
  render();
  registerWorker();
}

function bindStaticEvents() {
  $("#house").addEventListener("change", onHouseChange);
  $("#end-game").addEventListener("click", endGame);
  $("#fab").addEventListener("click", () => setSheet($("#sheet").hidden));
  $("#close-sheet").addEventListener("click", () => setSheet(false));
  $("#sheet").addEventListener("submit", onAdd);
  $("#sheet").addEventListener("click", onSheetClick);
  $("#sheet").addEventListener("input", onSheetInput);
  $("#sheet").addEventListener("change", onSheetInput);
  $("#rarities").addEventListener("click", onSummaryClick);
  $("#types").addEventListener("click", onSummaryClick);
  $("#sizes").addEventListener("click", onSummaryClick);
  $("#detail-list").addEventListener("click", onDetailClick);
  $("#detail").addEventListener("change", onItemEdit);
}

function emptyGroup() {
  return { rarity: "", type: "", size: "", count: "1", price: "", use: "known", open: "" };
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

function renderGroups() {
  const root = $("#groups");
  if (!root || !state.data) return;
  root.replaceChildren();
  state.groups.forEach((group, index) => {
    root.appendChild(buildGroupElement(group, index));
  });
}

function buildGroupElement(group, index) {
  const entry = document.createElement("div");
  entry.className = group.use === "max" ? "entry is-max" : "entry";
  entry.dataset.group = String(index);

  const head = document.createElement("div");
  head.className = "entry-head";
  const countLabel = document.createElement("label");
  countLabel.className = "field";
  const countName = document.createElement("span");
  countName.textContent = "Count";
  const countInput = document.createElement("input");
  countInput.className = "group-count";
  countInput.type = "number";
  countInput.min = "1";
  countInput.step = "1";
  countInput.inputMode = "numeric";
  countInput.autocomplete = "off";
  countInput.enterKeyHint = "done";
  countInput.value = group.count;
  countInput.setAttribute("aria-label", `Count for group ${index + 1}`);
  countLabel.append(countName, countInput);
  head.appendChild(countLabel);

  const useLabel = document.createElement("label");
  useLabel.className = "field count-use";
  const useName = document.createElement("span");
  useName.className = "visually-hidden";
  useName.textContent = "How this count is used";
  const useSelect = document.createElement("select");
  useSelect.className = "group-use";
  useSelect.setAttribute("aria-label", `How to use the count for group ${index + 1}`);
  [
    ["known", "Known count"],
    ["max", "Max"],
    ["both", "Both"]
  ].forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    useSelect.appendChild(option);
  });
  useSelect.value = group.use === "max" || group.use === "both" ? group.use : "known";
  useLabel.append(useName, useSelect);
  head.appendChild(useLabel);

  if (state.groups.length > 1) {
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "text-btn";
    remove.dataset.removeGroup = String(index);
    remove.textContent = "Remove";
    head.appendChild(remove);
  }
  entry.appendChild(head);
  entry.appendChild(priceField(group, index));
  entry.appendChild(categoryRow(group));

  entry.appendChild(choiceField("Rarity", "rarity", "add-rarities", group, state.data.rarities.map((rarity) => ({
    id: rarity.id,
    label: rarity.name,
    color: rarity.color,
    ink: rarity.ink
  })), "Rarity"));
  entry.appendChild(choiceField("Type", "type", "", group, state.data.types.map((type) => ({
    id: type.id,
    label: type.name
  })), "Type"));
  entry.appendChild(choiceField("Size", "size", "add-sizes", group, state.data.sizePresets.map((size) => ({
    id: String(size),
    label: sizeLabel(size)
  })), "Size in tiles"));
  return entry;
}

function categoryRow(group) {
  const row = document.createElement("div");
  row.className = "cat-row";
  row.setAttribute("role", "group");
  row.setAttribute("aria-label", "Category");
  [
    ["rarity", "Rarity"],
    ["type", "Type"],
    ["size", "Size"]
  ].forEach(([kind, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cat-btn";
    button.dataset.openCat = kind;
    const name = document.createElement("span");
    name.className = "cat-name";
    name.textContent = label;
    const value = document.createElement("span");
    value.className = "cat-value";
    button.append(name, value);
    paintCategoryButton(button, group);
    row.appendChild(button);
  });
  return row;
}

function paintCategoryButton(button, group) {
  const kind = button.dataset.openCat;
  const picked = categoryValue(group, kind);
  const value = button.querySelector(".cat-value");
  value.textContent = picked.label;
  button.classList.toggle("is-rarity", Boolean(picked.color));
  if (picked.color) {
    button.style.setProperty("--chip", picked.color);
    button.style.setProperty("--chip-ink", picked.ink);
  } else {
    button.style.removeProperty("--chip");
    button.style.removeProperty("--chip-ink");
  }
  const open = group.open === kind;
  button.setAttribute("aria-pressed", open ? "true" : "false");
  button.setAttribute("aria-expanded", open ? "true" : "false");
}

function categoryValue(group, kind) {
  if (kind === "rarity" && group.rarity) {
    const rarity = state.data.rarities.find((entry) => entry.id === group.rarity);
    if (rarity) return { label: rarity.name, color: rarity.color, ink: rarity.ink };
  }
  if (kind === "type" && group.type) {
    const type = state.data.types.find((entry) => entry.id === group.type);
    if (type) return { label: type.name, color: "", ink: "" };
  }
  if (kind === "size" && group.size) {
    return { label: sizeLabel(Number(group.size)), color: "", ink: "" };
  }
  return { label: "", color: "", ink: "" };
}

function priceField(group, index) {
  const priceLabel = document.createElement("label");
  priceLabel.className = "field";
  const priceName = document.createElement("span");
  priceName.textContent = "Exact price";
  const priceInput = document.createElement("input");
  priceInput.className = "group-price";
  priceInput.inputMode = "text";
  priceInput.autocomplete = "off";
  priceInput.enterKeyHint = "done";
  priceInput.placeholder = pricePlaceholder(group.count);
  priceInput.value = group.price;
  priceInput.setAttribute("aria-label", `Exact price for group ${index + 1}`);
  priceLabel.append(priceName, priceInput);
  return priceLabel;
}

function pricePlaceholder(count) {
  const total = parseCount(count);
  if (total != null && total > 1) return "One per treasure: 120k, 80k";
  return "Optional, such as 120k or 1.2m";
}

function choiceField(legendText, kind, extraClass, group, options, ariaLabel) {
  const fieldset = document.createElement("fieldset");
  fieldset.className = "cat-panel";
  fieldset.dataset.catPanel = kind;
  fieldset.hidden = group.open !== kind;
  const legend = document.createElement("legend");
  legend.textContent = legendText;
  const chips = document.createElement("div");
  chips.className = extraClass ? `chips ${extraClass}` : "chips";
  chips.setAttribute("role", "group");
  chips.setAttribute("aria-label", ariaLabel);
  options.forEach((option) => {
    const button = choiceChip(kind, option.id, option.label, option.color, option.ink);
    button.setAttribute("aria-pressed", group[kind] === option.id ? "true" : "false");
    chips.appendChild(button);
  });
  fieldset.append(legend, chips);
  return fieldset;
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
    button.classList.add("is-swatch");
    button.textContent = "";
    button.setAttribute("aria-label", label);
    button.style.setProperty("--chip", color);
    button.style.setProperty("--chip-ink", ink);
  }
  return button;
}

function onHouseChange() {
  if (!state.board) return;
  state.board.house = $("#house").value;
  persist();
  render();
}

function setSheet(open) {
  $("#sheet").hidden = !open;
  $("#fab").textContent = open ? "×" : "+";
  $("#fab").setAttribute("aria-label", open ? "Close add form" : "Add information");
  if (!open) return;
  const count = $("#sheet").querySelector(".group-count");
  if (count) count.focus();
}

function onSheetClick(event) {
  const remove = event.target.closest("[data-remove-group]");
  if (remove) {
    removeGroup(Number(remove.dataset.removeGroup));
    return;
  }

  if (event.target.closest("#add-group")) {
    captureInputs();
    state.groups.push(emptyGroup());
    renderGroups();
    hideError();
    const counts = $("#sheet").querySelectorAll(".group-count");
    const last = counts[counts.length - 1];
    if (last) last.focus();
    return;
  }

  const category = event.target.closest("[data-open-cat]");
  if (category) {
    const entry = category.closest("[data-group]");
    if (!entry) return;
    const group = state.groups[Number(entry.dataset.group)];
    if (!group) return;
    const kind = category.dataset.openCat;
    group.open = group.open === kind ? "" : kind;
    syncCategoryPanels(entry, group);
    hideError();
    return;
  }

  const button = event.target.closest("[data-pick]");
  if (!button) return;
  const entry = button.closest("[data-group]");
  if (!entry) return;
  const group = state.groups[Number(entry.dataset.group)];
  if (!group) return;
  const kind = button.dataset.pick;
  group[kind] = group[kind] === button.dataset.id ? "" : button.dataset.id;
  syncGroupChips(entry, group);
  hideError();
}

function onSheetInput(event) {
  const entry = event.target.closest("[data-group]");
  if (!entry) return;
  const group = state.groups[Number(entry.dataset.group)];
  if (!group) return;
  if (event.target.classList.contains("group-count")) {
    group.count = event.target.value;
    const price = entry.querySelector(".group-price");
    if (price) price.placeholder = pricePlaceholder(group.count);
  }
  if (event.target.classList.contains("group-price")) group.price = event.target.value;
  if (event.target.classList.contains("group-use")) {
    group.use = event.target.value;
    entry.classList.toggle("is-max", group.use === "max");
  }
  hideError();
}

function syncGroupChips(entry, group) {
  entry.querySelectorAll("[data-pick]").forEach((button) => {
    button.setAttribute("aria-pressed", group[button.dataset.pick] === button.dataset.id ? "true" : "false");
  });
  syncCategoryPanels(entry, group);
}

function syncCategoryPanels(entry, group) {
  entry.querySelectorAll("[data-open-cat]").forEach((button) => {
    paintCategoryButton(button, group);
  });
  entry.querySelectorAll("[data-cat-panel]").forEach((panel) => {
    panel.hidden = group.open !== panel.dataset.catPanel;
  });
}

function captureInputs() {
  document.querySelectorAll("#groups .entry").forEach((entry) => {
    const group = state.groups[Number(entry.dataset.group)];
    if (!group) return;
    const count = entry.querySelector(".group-count");
    const price = entry.querySelector(".group-price");
    const use = entry.querySelector(".group-use");
    if (count) group.count = count.value;
    if (price) group.price = price.value;
    if (use) group.use = use.value;
  });
}

function removeGroup(index) {
  if (state.groups.length < 2) return;
  captureInputs();
  state.groups.splice(index, 1);
  renderGroups();
  hideError();
}

function resetComposer() {
  state.groups = [emptyGroup()];
  renderGroups();
  hideError();
}

function onAdd(event) {
  event.preventDefault();
  if (!state.board) return;
  captureInputs();
  const parsed = [];
  for (let index = 0; index < state.groups.length; index += 1) {
    const group = state.groups[index];
    const count = parseCount(group.count);
    if (count == null) {
      showError("Enter a whole number of at least 1 for each group.");
      return;
    }
    const use = group.use === "max" || group.use === "both" ? group.use : "known";
    const prices = use === "max" ? { prices: [] } : parsePriceList(group.price);
    if (prices.error) {
      showError(prices.error);
      return;
    }
    if (prices.prices.length > count) {
      const expected = count === 1
        ? "A comma separates prices. For one price, write 1200000 or 1.2m."
        : `Enter at most ${count} prices, one for each treasure.`;
      showError(expected);
      return;
    }
    const spec = {
      count,
      rarity: group.rarity || "",
      type: group.type || "",
      size: group.size ? Number(group.size) : null,
      prices: prices.prices,
      use
    };
    const picks = categoryPicks(spec);
    if (use === "max" && picks.length > 1) {
      showError("Choose one rarity, type, or size for a max.");
      return;
    }
    if (use === "both" && picks.length === 0) {
      showError("Choose a rarity, type, or size to save the count and the max together.");
      return;
    }
    parsed.push(spec);
  }

  const totalSpecs = parsed.filter((spec) => spec.use === "max" && categoryPicks(spec).length === 0);
  if (totalSpecs.length > 1) {
    showError("Enter one max for the total number of treasures.");
    return;
  }
  const maxSpecs = parsed.filter((spec) => (spec.use === "max" || spec.use === "both") && categoryPicks(spec).length > 0);
  const itemSpecs = parsed.filter((spec) => spec.use !== "max");
  itemSpecs.forEach((spec) => {
    for (let index = 0; index < spec.count; index += 1) {
      state.board.items.push(blankItem(factFrom(spec, index)));
    }
  });
  if (totalSpecs.length === 1) state.board.treasureTotal = totalSpecs[0].count;
  applyMaxes(maxSpecs);
  maxSpecs.forEach((spec) => {
    if (spec.use === "max" && spec.rarity) revealUnknownForMax(spec.count);
  });

  resetComposer();
  setSheet(false);
  persist();
  render();
}

function applyMaxes(specs) {
  specs.forEach((spec) => {
    categoryPicks(spec).forEach((picked) => {
      state.board.maxCounts[picked.kind][picked.id] = spec.count;
    });
  });
}

function revealUnknownForMax(count) {
  const board = state.board;
  const unrated = board.items.filter((item) => !item.rarity).length;
  let make = Math.max(0, count - unrated);
  if (board.treasureTotal != null) make = Math.min(make, Math.max(0, board.treasureTotal - board.items.length));
  for (let index = 0; index < make; index += 1) board.items.push(blankItem({}));
}

function categoryPicks(spec) {
  const picks = [];
  if (spec.rarity) picks.push({ kind: "rarities", id: spec.rarity });
  if (spec.type) picks.push({ kind: "types", id: spec.type });
  if (spec.size != null) picks.push({ kind: "sizes", id: String(spec.size) });
  return picks;
}

function emptyMaxCounts() {
  return { rarities: {}, types: {}, sizes: {} };
}

function categoryMax(selected) {
  if (!selected || !state.board.maxCounts) return null;
  const value = state.board.maxCounts[selected.kind]?.[selected.id];
  return Number.isInteger(value) ? value : null;
}

function hasBoardInfo() {
  if (!state.board) return false;
  if (state.board.items.length || state.board.treasureTotal != null) return true;
  const maxes = state.board.maxCounts;
  if (!maxes) return false;
  return ["rarities", "types", "sizes"].some((kind) => Object.keys(maxes[kind] || {}).length > 0);
}

function factFrom(spec, index) {
  const fact = {};
  if (spec.rarity) fact.rarity = spec.rarity;
  if (spec.type) fact.type = spec.type;
  if (spec.size != null) fact.size = spec.size;
  const price = priceAt(spec, index);
  if (price != null) fact.price = price;
  return fact;
}

function priceAt(spec, index) {
  if (!spec.prices || index >= spec.prices.length) return null;
  return spec.prices[index];
}

function parsePriceList(raw) {
  const parts = splitPriceParts(raw);
  if (!parts.length) return { prices: [] };
  const prices = [];
  for (let index = 0; index < parts.length; index += 1) {
    const price = parseCoins(parts[index]);
    if (Number.isNaN(price)) {
      return { error: "Enter a price like 120000, 120k, or 1.2m. A comma only separates prices." };
    }
    prices.push(price);
  }
  return { prices };
}

function splitPriceParts(raw) {
  return String(raw ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function blankItem(fact) {
  return {
    id: createId(),
    rarity: fact.rarity || "",
    type: fact.type || "",
    size: fact.size == null ? null : fact.size,
    price: fact.price == null ? null : fact.price
  };
}

function parseCount(raw) {
  const text = String(raw ?? "").trim();
  if (!/^\d+$/.test(text)) return null;
  const value = Number(text);
  if (!Number.isInteger(value) || value < 1) return null;
  return value;
}

function onSummaryClick(event) {
  const adjust = event.target.closest("[data-chip-adjust]");
  if (adjust) {
    adjustChip(adjust);
    return;
  }
  const button = event.target.closest("[data-open]");
  if (!button || !state.board) return;
  const next = { kind: button.dataset.open, id: button.dataset.id };
  const same = state.selected && state.selected.kind === next.kind && state.selected.id === next.id;
  state.selected = same ? null : next;
  state.detailOpen = null;
  render();
}

function onDetailClick(event) {
  const adjust = event.target.closest("[data-adjust]");
  if (adjust) {
    adjustDetail(adjust);
    return;
  }
  const opener = event.target.closest("[data-open-field]");
  if (!opener) return;
  state.detailOpen = state.detailOpen === opener.dataset.openField ? null : opener.dataset.openField;
  render();
}

function adjustDetail(button) {
  if (!state.board || !state.selected) return;
  const delta = Number(button.dataset.adjust);
  const changed = button.dataset.childField
    ? adjustNested(button, delta)
    : adjustTop(button, delta);
  if (!changed) return;
  if (!selectionStillOpen()) {
    state.selected = null;
    state.detailOpen = null;
  }
  persist();
  render();
}

function adjustChip(button) {
  if (!state.board) return;
  const kind = button.dataset.field;
  const id = button.dataset.id;
  const delta = Number(button.dataset.chipAdjust);
  const changed = delta > 0 ? increaseChild({}, kind, id) : decreaseChild({}, kind, id);
  if (!changed) return;
  persist();
  render();
}

function adjustTop(button, delta) {
  const parent = parentFacts(state.selected);
  const field = button.dataset.field;
  const id = button.dataset.id;
  if (id === "unknown") return false;
  if (delta > 0) return increaseChild(parent, field, id);
  return decreaseChild(parent, field, id);
}

function adjustNested(button, delta) {
  const facts = parentFacts(state.selected);
  writeDetailFact(facts, button.dataset.field, button.dataset.id);
  return adjustChild(facts, button.dataset.childField, button.dataset.childId, delta);
}

function adjustGroup(facts, delta) {
  if (delta > 0) {
    state.board.items.push(blankItem(facts));
    return true;
  }
  return removeOneItem(facts);
}

function adjustChild(facts, field, id, delta) {
  if (id === "unknown") return false;
  if (delta > 0) return increaseChild(facts, field, id);
  return decreaseChild(facts, field, id);
}

function increaseChild(facts, field, id) {
  const open = state.board.items
    .filter((item) => itemMatches(item, facts) && childUnset(item, field))
    .sort((left, right) => detailSpecificity(left) - detailSpecificity(right));
  if (!open.length) return false;
  writeDetailFact(open[0], field, id);
  return true;
}

function decreaseChild(facts, field, id) {
  const specific = Object.assign({}, facts);
  writeDetailFact(specific, field, id);
  const match = state.board.items
    .filter((item) => itemMatches(item, specific))
    .sort((left, right) => detailSpecificity(left) - detailSpecificity(right))[0];
  if (!match) return false;
  writeDetailFact(match, field, "unknown");
  return true;
}

function childUnset(item, field) {
  if (field === "rarities") return !item.rarity;
  if (field === "types") return !item.type;
  return item.size == null;
}

function endGame() {
  if (!state.board) return;
  if (hasBoardInfo() && !window.confirm("End this game and clear the revealed information?")) return;
  state.board.items = [];
  state.board.treasureTotal = null;
  state.board.maxCounts = emptyMaxCounts();
  state.selected = null;
  state.detailOpen = null;
  resetComposer();
  setSheet(false);
  persist();
  render();
}

function render() {
  if (resolveUnknown()) persist();
  const counts = tally(state.board.items, state.data);
  renderGroup($("#rarities"), $("#rarity-group"), "rarities", state.data.rarities.map((entry) => ({
    id: entry.id,
    label: entry.name,
    count: counts.rarities[entry.id] || 0,
    max: state.board.maxCounts.rarities[entry.id],
    color: entry.color,
    ink: entry.ink
  })));
  renderUnknown("rarities");
  renderGroup($("#types"), $("#type-group"), "types", state.data.types.map((entry) => ({
    id: entry.id,
    label: entry.name,
    count: counts.types[entry.id] || 0,
    max: state.board.maxCounts.types[entry.id]
  })));
  renderUnknown("types");
  renderGroup($("#sizes"), $("#size-group"), "sizes", state.data.sizePresets.map((size) => ({
    id: String(size),
    label: sizeLabel(size),
    count: counts.sizes[String(size)] || 0,
    max: state.board.maxCounts.sizes[String(size)]
  })));
  renderUnknown("sizes");
  $("#info-empty").hidden = hasBoardInfo();
  renderDetail();
  renderEstimate();
  renderExact();
  renderTreasureTotal();
}

function renderUnknown(kind) {
  const count = unknownCount(state.board, kind);
  if (count <= 0) return;
  const fieldset = $(unknownFieldset(kind));
  fieldset.hidden = false;
  const selected = isUnknownSelection(state.selected) && state.selected.kind === kind;
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "chip is-on";
  chip.classList.toggle("is-selected", selected);
  chip.dataset.open = kind;
  chip.dataset.id = "unknown";
  chip.setAttribute("aria-pressed", selected ? "true" : "false");
  chip.style.setProperty("--chip", "#3a4154");
  chip.style.setProperty("--chip-ink", "#f6f1e7");
  const name = document.createElement("span");
  name.textContent = "Unknown";
  const number = document.createElement("span");
  number.className = "count";
  number.textContent = String(count);
  chip.append(name, number);
  $(unknownContainer(kind)).appendChild(chip);
}

function unknownFieldset(kind) {
  if (kind === "types") return "#type-group";
  if (kind === "sizes") return "#size-group";
  return "#rarity-group";
}

function unknownContainer(kind) {
  if (kind === "types") return "#types";
  if (kind === "sizes") return "#sizes";
  return "#rarities";
}

function unknownCount(board, kind) {
  if (!board) return 0;
  const missing = board.items.filter((item) => attributeMissing(item, kind)).length;
  if (board.treasureTotal == null) return missing;
  return missing + Math.max(0, board.treasureTotal - board.items.length);
}

function attributeMissing(item, kind) {
  if (kind === "rarities") return !item.rarity;
  if (kind === "types") return !item.type;
  return item.size == null;
}

function unknownRemainder(board) {
  return unknownCount(board, "rarities");
}

function resolveUnknown() {
  const board = state.board;
  if (!board || !state.data) return false;
  const real = state.data.rarities.filter((entry) => entry.id !== "unknown");
  const missing = real.filter((entry) => knownRarityCount(board, entry.id) == null);
  if (missing.length !== 1) return false;
  const knownSum = real.reduce((sum, entry) => {
    const count = knownRarityCount(board, entry.id);
    return count == null ? sum : sum + count;
  }, 0);
  const listedUnknown = board.items.filter((item) => item.rarity === "unknown").length;
  const unknownMax = board.maxCounts.rarities.unknown;
  let remaining = null;
  if (board.treasureTotal != null) remaining = board.treasureTotal - knownSum;
  else if (Number.isInteger(unknownMax)) remaining = unknownMax;
  if (remaining == null || remaining < 0 || listedUnknown > remaining) return false;
  let changed = false;
  real.forEach((entry) => {
    const count = entry.id === missing[0].id ? remaining : knownRarityCount(board, entry.id);
    if (board.maxCounts.rarities[entry.id] !== count) {
      board.maxCounts.rarities[entry.id] = count;
      changed = true;
    }
  });
  board.items.forEach((item) => {
    if (item.rarity !== "unknown") return;
    item.rarity = missing[0].id;
    changed = true;
  });
  if (Object.prototype.hasOwnProperty.call(board.maxCounts.rarities, "unknown")) {
    delete board.maxCounts.rarities.unknown;
    changed = true;
  }
  if (state.selected && state.selected.kind === "rarities" && state.selected.id === "unknown") {
    state.selected = remaining > 0 ? { kind: "rarities", id: missing[0].id } : null;
    changed = true;
  }
  return changed;
}

function knownRarityCount(board, id) {
  const max = board.maxCounts?.rarities?.[id];
  return Number.isInteger(max) ? max : null;
}

function renderTreasureTotal() {
  const total = $("#treasure-total");
  if (!total) return;
  const recorded = state.board ? state.board.items.length : 0;
  const cap = state.board ? state.board.treasureTotal : null;
  total.textContent = Number.isInteger(cap) ? `${recorded} of ${cap}` : String(recorded);
}

function renderGroup(container, fieldset, kind, entries) {
  container.replaceChildren();
  const visible = entries.filter((entry) => entry.count > 0 || Number.isInteger(entry.max));
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
      button.classList.add("is-swatch");
      button.setAttribute("aria-label", `${entry.label}, ${quantityLabel(entry.count, entry.max, kind)}`);
    }
    const count = document.createElement("span");
    count.className = "count";
    count.textContent = quantityLabel(entry.count, entry.max, kind);
    if (!entry.color) {
      const name = document.createElement("span");
      name.textContent = entry.label;
      button.append(name);
    }
    button.append(count);
    const wrap = document.createElement("div");
    wrap.className = "chip-wrap";
    wrap.append(
      chipAdjust("-1", kind, entry.id, entry.count < 1),
      button,
      chipAdjust("1", kind, entry.id, !canAssign({}, kind, entry.id))
    );
    container.appendChild(wrap);
  });
}

function chipAdjust(delta, kind, id, disabled) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "step-btn chip-adjust";
  button.dataset.chipAdjust = delta;
  button.dataset.field = kind;
  button.dataset.id = id;
  button.disabled = disabled;
  button.textContent = delta === "1" ? "+" : "−";
  button.setAttribute("aria-label", delta === "1" ? "Increase" : "Decrease");
  return button;
}

function detailLevels(selected) {
  if (!selected) return [];
  const order = ["rarities", "types", "sizes"];
  const rest = order.filter((field) => field !== selected.kind);
  if (selected.id === "unknown") return [selected.kind].concat(rest);
  return rest;
}

function fieldLabel(field) {
  if (field === "rarities") return "Rarity";
  if (field === "types") return "Type";
  return "Size";
}

function filledCount(parent, field) {
  return state.board.items.filter((item) => itemMatches(item, parent) && !childUnset(item, field)).length;
}

function canAssign(facts, field, id) {
  if (id === "unknown") return false;
  const pool = Object.assign({}, facts);
  writeDetailFact(pool, field, "unknown");
  return countFacts(pool) > 0;
}

function parentFacts(selected) {
  if (!selected) return {};
  if (selected.kind === "rarities") return { rarity: selected.id === "unknown" ? "" : selected.id };
  if (selected.kind === "types") return { type: selected.id === "unknown" ? "" : selected.id };
  return { size: selected.id === "unknown" ? null : Number(selected.id) };
}

function writeDetailFact(facts, field, id) {
  if (field === "rarities") facts.rarity = id === "unknown" ? "" : id;
  else if (field === "types") facts.type = id === "unknown" ? "" : id;
  else facts.size = id === "unknown" ? null : Number(id);
}

function itemMatches(item, facts) {
  if (Object.prototype.hasOwnProperty.call(facts, "rarity")) {
    if (facts.rarity ? item.rarity !== facts.rarity : Boolean(item.rarity)) return false;
  }
  if (Object.prototype.hasOwnProperty.call(facts, "type")) {
    if (facts.type ? item.type !== facts.type : Boolean(item.type)) return false;
  }
  if (Object.prototype.hasOwnProperty.call(facts, "size")) {
    if (facts.size != null ? item.size !== facts.size : item.size != null) return false;
  }
  return true;
}

function countFacts(facts) {
  return state.board.items.filter((item) => itemMatches(item, facts)).length;
}

function removeOneItem(facts) {
  const ranked = state.board.items
    .map((item, index) => ({ item, index }))
    .filter((entry) => itemMatches(entry.item, facts))
    .sort((left, right) => detailSpecificity(left.item) - detailSpecificity(right.item) || right.index - left.index);
  if (!ranked.length) return false;
  state.board.items.splice(ranked[0].index, 1);
  return true;
}

function detailSpecificity(item) {
  return (item.rarity ? 1 : 0) + (item.type ? 1 : 0) + (item.size != null ? 1 : 0) + (item.price != null ? 1 : 0);
}

function levelChoices(kind) {
  if (kind === "rarities") {
    return state.data.rarities.map((entry) => ({
      id: entry.id,
      label: entry.name,
      color: entry.color,
      ink: entry.ink
    }));
  }
  if (kind === "types") return state.data.types.map((entry) => ({ id: entry.id, label: entry.name }));
  return state.data.sizePresets.map((size) => ({ id: String(size), label: sizeLabel(size) }));
}

function renderDetail() {
  const box = $("#detail");
  const items = matchingItems();
  const unknown = isUnknownSelection(state.selected);
  const max = unknown ? null : categoryMax(state.selected);
  const unknownOpen = unknown && unknownCount(state.board, state.selected.kind) > 0;
  if (!state.selected || (!items.length && max == null && !unknownOpen)) {
    box.hidden = true;
    $("#detail-list").replaceChildren();
    $("#detail-empty").hidden = true;
    return;
  }
  $(unknownFieldset(state.selected.kind)).appendChild(box);
  box.hidden = false;
  const label = selectionLabel(state.selected);
  $("#detail-title").textContent = max == null ? label : `${label} · ${items.length} of ${max}`;
  $("#detail-empty").hidden = items.length > 0 || unknownOpen;
  const list = $("#detail-list");
  list.className = "detail-cats";
  list.replaceChildren();
  if (!items.length && !unknownOpen) return;
  const levels = detailLevels(state.selected);
  const parent = parentFacts(state.selected);
  levels.forEach((field) => {
    const ownUnknown = unknown && field === state.selected.kind;
    const filled = ownUnknown ? items.length : filledCount(parent, field);
    const open = state.detailOpen === field;
    const row = document.createElement("li");
    row.className = open ? "detail-cat is-open" : "detail-cat";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "detail-cat-btn";
    button.dataset.openField = field;
    button.setAttribute("aria-expanded", open ? "true" : "false");
    const name = document.createElement("span");
    name.textContent = fieldLabel(field);
    const count = document.createElement("span");
    count.className = "count";
    count.textContent = items.length ? `${filled} of ${items.length}` : String(filled);
    button.append(name, count);
    row.appendChild(button);
    if (open) {
      const choices = document.createElement("ul");
      choices.className = "detail-list";
      rowsFor(field, parent, ownUnknown).forEach((choice) => {
        const facts = Object.assign({}, parent);
        writeDetailFact(facts, field, choice.id);
        choices.appendChild(stepRow(choice, field, facts));
      });
      row.appendChild(choices);
    }
    list.appendChild(row);
  });
  if (!unknown && items.length) appendItemEditors(list, items);
}

function appendItemEditors(list, items) {
  const block = document.createElement("li");
  block.className = "detail-items";
  const title = document.createElement("p");
  title.className = "detail-items-title";
  title.textContent = "Items";
  block.appendChild(title);
  const priced = items.filter((item) => item.price != null);
  const unpriced = items.filter((item) => item.price == null);
  priced.concat(unpriced).forEach((item) => block.appendChild(itemCard(item)));
  list.appendChild(block);
}

function itemCard(item) {
  const card = document.createElement("div");
  card.className = "item-card";
  card.dataset.item = item.id;
  if (item.rarity) {
    const rarity = state.data.rarities.find((entry) => entry.id === item.rarity);
    if (rarity) card.style.borderColor = rarity.color;
  }
  card.append(itemPriceField(item), itemFactSelect(item, "rarity"), itemFactSelect(item, "type"), itemFactSelect(item, "size"));
  return card;
}

function itemPriceField(item) {
  const label = document.createElement("label");
  label.className = "field";
  const name = document.createElement("span");
  name.textContent = "Exact price";
  const input = document.createElement("input");
  input.dataset.itemField = "price";
  input.inputMode = "text";
  input.autocomplete = "off";
  input.enterKeyHint = "done";
  input.placeholder = "120k or 1.2m";
  input.value = item.price == null ? "" : String(item.price);
  input.setAttribute("aria-label", "Exact price");
  label.append(name, input);
  return label;
}

function itemFactSelect(item, field) {
  const label = document.createElement("label");
  label.className = "field";
  const name = document.createElement("span");
  name.textContent = field === "rarity" ? "Rarity" : field === "type" ? "Type" : "Size";
  const select = document.createElement("select");
  select.dataset.itemField = field;
  select.setAttribute("aria-label", name.textContent);
  const blank = document.createElement("option");
  blank.value = "";
  blank.textContent = "Unknown";
  select.appendChild(blank);
  if (field === "rarity") {
    state.data.rarities.forEach((entry) => {
      const option = document.createElement("option");
      option.value = entry.id;
      option.textContent = entry.name;
      select.appendChild(option);
    });
    select.value = item.rarity || "";
  } else if (field === "type") {
    state.data.types.forEach((entry) => {
      const option = document.createElement("option");
      option.value = entry.id;
      option.textContent = entry.name;
      select.appendChild(option);
    });
    select.value = item.type || "";
  } else {
    state.data.sizePresets.forEach((size) => {
      const option = document.createElement("option");
      option.value = String(size);
      option.textContent = sizeLabel(size);
      select.appendChild(option);
    });
    select.value = item.size == null ? "" : String(item.size);
  }
  label.append(name, select);
  return label;
}

function onItemEdit(event) {
  const card = event.target.closest("[data-item]");
  if (!card || !state.board) return;
  const item = state.board.items.find((entry) => entry.id === card.dataset.item);
  if (!item) return;
  const field = event.target.dataset.itemField;
  if (field === "price") {
    const raw = event.target.value.trim();
    if (!raw) item.price = null;
    else {
      const price = parseCoins(raw);
      if (Number.isNaN(price)) {
        event.target.setCustomValidity("Enter a price like 120000, 120k, or 1.2m.");
        event.target.reportValidity();
        return;
      }
      event.target.setCustomValidity("");
      item.price = price;
    }
  } else if (field === "rarity") item.rarity = event.target.value;
  else if (field === "type") item.type = event.target.value;
  else if (field === "size") item.size = event.target.value ? Number(event.target.value) : null;
  else return;
  persist();
  render();
}

function rowsFor(kind, parent, hideUnknown) {
  const rows = levelChoices(kind).map((choice) => {
    const facts = Object.assign({}, parent);
    writeDetailFact(facts, kind, choice.id);
    return Object.assign({}, choice, { count: countFacts(facts) });
  });
  if (hideUnknown) return rows;
  const unknownFacts = Object.assign({}, parent);
  writeDetailFact(unknownFacts, kind, "unknown");
  const missing = countFacts(unknownFacts);
  if (missing > 0) rows.push({ id: "unknown", label: "Unknown", count: missing });
  return rows;
}

function stepRow(choice, field, facts) {
  const row = document.createElement("li");
  row.className = "step-row";
  const label = document.createElement("span");
  label.className = "step-label is-static";
  label.textContent = choice.label;
  if (choice.color) label.style.color = choice.color;
  row.append(label, stepper(choice.count, field, choice.id, null, null, canAssign(facts, field, choice.id)));
  return row;
}

function stepper(count, field, id, childField, childId, canIncrease) {
  const box = document.createElement("div");
  box.className = "stepper";
  const targetId = childField ? childId : id;
  const down = document.createElement("button");
  down.type = "button";
  down.className = "step-btn";
  down.dataset.adjust = "-1";
  down.dataset.field = field;
  down.dataset.id = id;
  if (childField) {
    down.dataset.childField = childField;
    down.dataset.childId = childId;
  }
  down.textContent = "−";
  down.disabled = targetId === "unknown" || count < 1;
  down.setAttribute("aria-label", "Decrease");
  const number = document.createElement("span");
  number.className = "step-count";
  number.textContent = String(count);
  const up = document.createElement("button");
  up.type = "button";
  up.className = "step-btn";
  up.dataset.adjust = "1";
  up.dataset.field = field;
  up.dataset.id = id;
  if (childField) {
    up.dataset.childField = childField;
    up.dataset.childId = childId;
  }
  up.textContent = "+";
  up.disabled = targetId === "unknown" || !canIncrease;
  up.setAttribute("aria-label", "Increase");
  box.append(down, number, up);
  return box;
}

function renderEstimate() {
  const min = catalogWorth(state.board, state.data, false);
  const max = Math.max(min, catalogWorth(state.board, state.data, true));
  $("#worth-range").textContent = max === 0
    ? "0"
    : min === max
      ? formatCoins(min)
      : `${formatCoins(min)} – ${formatCoins(max)}`;
}

function renderExact() {
  const total = state.board.items.reduce((sum, item) => sum + (item.price == null ? 0 : item.price), 0);
  $("#exact-total").textContent = formatCoins(total);
}

function isUnknownSelection(selected) {
  return Boolean(selected && selected.id === "unknown");
}

function selectionStillOpen() {
  if (!state.selected) return false;
  if (matchingItems().length) return true;
  if (isUnknownSelection(state.selected)) return unknownCount(state.board, state.selected.kind) > 0;
  return categoryMax(state.selected) != null;
}

function matchingItems() {
  if (!state.selected) return [];
  return state.board.items.filter((item) => {
    if (state.selected.id === "unknown") return attributeMissing(item, state.selected.kind);
    if (state.selected.kind === "rarities") return item.rarity === state.selected.id;
    if (state.selected.kind === "types") return item.type === state.selected.id;
    return item.size != null && String(item.size) === state.selected.id;
  });
}

function selectionLabel(selected) {
  if (selected.id === "unknown") return "Unknown";
  if (selected.kind === "rarities") return rarityName(selected.id);
  if (selected.kind === "types") return typeName(selected.id);
  return `${selected.id} tiles`;
}

function itemSummary(item) {
  const parts = [];
  if (item.rarity) parts.push(rarityName(item.rarity));
  if (item.type) parts.push(typeName(item.type));
  if (item.size != null) parts.push(`${item.size} tile${item.size === 1 ? "" : "s"}`);
  return parts.join(" · ") || "Unknown rarity";
}

function sizeLabel(size) {
  const tiles = Number(size);
  return tiles === 1 ? "1 tile" : `${tiles} tiles`;
}

function quantityLabel(count, max, kind) {
  if (Number.isInteger(max)) return `${count} of ${max}`;
  if (kind === "sizes") return `×${count}`;
  return String(count);
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

function usesMaxConstraint(board) {
  if (!board || board.treasureTotal == null || !board.maxCounts) return false;
  return Object.keys(board.maxCounts.rarities || {}).some((id) => Number.isInteger(board.maxCounts.rarities[id]));
}

function houseRange(data, houseId) {
  const house = (data.houses || []).find((entry) => entry.id === houseId);
  return {
    min: Number.isFinite(house?.minPrice) ? house.minPrice : 0,
    max: Number.isFinite(house?.maxPrice) ? house.maxPrice : Infinity
  };
}

function catalogWorth(board, data, pickMax) {
  const treasures = data.treasures || [];
  const slots = estimateSlots(board);
  if (!slots.length || !treasures.length) return 0;
  const rooms = openRooms(board, data);
  const range = houseRange(data, board.house);
  const byPrice = (left, right) => {
    const diff = pickMax ? right.price - left.price : left.price - right.price;
    return diff || left.index - right.index;
  };
  const items = treasures.map((item, index) => ({ ...item, index })).sort(byPrice);
  const usual = items.filter((item) => item.price >= range.min && item.price <= range.max);
  const cheaper = items.filter((item) => item.price < range.min);
  const pricier = items.filter((item) => item.price > range.max);
  const slotPool = () => {
    if (!usual.length) return items;
    return usual.concat(pickMax ? pricier : cheaper).sort(byPrice);
  };
  const ordered = slots
    .map((slot, index) => ({
      slot,
      index,
      choices: slotPool(slot).filter((item) => matchesFacts(item, slot)).length
    }))
    .sort((left, right) => left.choices - right.choices || left.index - right.index);
  const used = new Set();
  return ordered.reduce((sum, entry) => {
    const pool = slotPool(entry.slot);
    const taken = takeItem(pool, used, entry.slot, rooms) ||
      (pool === items ? null : takeItem(items, used, entry.slot, rooms));
    if (!taken) return sum;
    used.add(taken.item.index);
    spend(taken.item, taken.slot, rooms);
    return sum + taken.item.price;
  }, 0);
}

function estimateSlots(board) {
  const active = usesMaxConstraint(board);
  const slots = [];
  (board.items || []).forEach((item) => {
    const rarity = item.rarity && item.rarity !== "unknown" ? item.rarity : null;
    slots.push({
      rarity,
      type: item.type || null,
      size: item.size == null ? null : item.size
    });
  });
  if (!active || board.treasureTotal == null) return slots;
  const unlisted = Math.max(0, board.treasureTotal - (board.items || []).length);
  const fillers = Math.min(unlisted, 60);
  for (let index = 0; index < fillers; index += 1) {
    slots.push({ rarity: null, type: null, size: null });
  }
  return slots;
}

function openRooms(board, data) {
  return {
    rarities: roomFor(board, data.rarities.map((entry) => entry.id).filter((id) => id !== "unknown"), "rarities", (item) => item.rarity || ""),
    types: roomFor(board, data.types.map((entry) => entry.id), "types", (item) => item.type || ""),
    sizes: roomFor(board, data.sizePresets.map(String), "sizes", (item) => item.size == null ? "" : String(item.size))
  };
}

function roomFor(board, ids, kind, read) {
  const maxes = board.maxCounts?.[kind] || {};
  if (!ids.some((id) => Number.isInteger(maxes[id]))) return null;
  const room = {};
  ids.forEach((id) => {
    const known = (board.items || []).filter((item) => read(item) === id).length;
    room[id] = Number.isInteger(maxes[id]) ? Math.max(0, maxes[id] - known) : Infinity;
  });
  return room;
}

function takeItem(items, used, slot, rooms) {
  const attempts = [slot];
  if (slot.size != null) attempts.push({ ...slot, size: null });
  for (let index = 0; index < attempts.length; index += 1) {
    const attempt = attempts[index];
    const found = items.find((item) => !used.has(item.index) && fits(item, attempt, rooms));
    if (found) return { item: found, slot: attempt };
  }
  return null;
}

function fits(item, slot, rooms) {
  if (!matchesFacts(item, slot)) return false;
  if (!slot.rarity && rooms.rarities && !(rooms.rarities[item.rarity] > 0)) return false;
  if (!slot.type && rooms.types && !(rooms.types[item.type] > 0)) return false;
  if (slot.size == null && rooms.sizes && !(rooms.sizes[String(item.size)] > 0)) return false;
  return true;
}

function matchesFacts(item, slot) {
  if (slot.rarity && item.rarity !== slot.rarity) return false;
  if (slot.type && !typeMatches(item.type, slot.type)) return false;
  if (slot.size != null && item.size !== slot.size) return false;
  return true;
}

function typeMatches(itemType, slotType) {
  if (itemType === slotType) return true;
  const figurine = itemType === "figurine" || itemType === "collection";
  const asked = slotType === "figurine" || slotType === "collection";
  return figurine && asked;
}

function spend(item, slot, rooms) {
  if (!slot.rarity && rooms.rarities && rooms.rarities[item.rarity] !== Infinity) rooms.rarities[item.rarity] -= 1;
  if (!slot.type && rooms.types && rooms.types[item.type] !== Infinity) rooms.types[item.type] -= 1;
  if (slot.size == null && rooms.sizes && rooms.sizes[String(item.size)] !== Infinity) rooms.sizes[String(item.size)] -= 1;
}

function parseCoins(raw) {
  if (raw == null) return null;
  const text = String(raw).trim().toLowerCase().replace(/\s+/g, "");
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
  const blank = { house: state.data.houses[0].id, items: [], treasureTotal: null, maxCounts: emptyMaxCounts() };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!saved || typeof saved !== "object") return blank;
    const items = Array.isArray(saved.items) ? saved.items.filter(validItem) : [];
    const total = Number(saved.treasureTotal);
    return {
      house: typeof saved.house === "string" ? saved.house : blank.house,
      items,
      treasureTotal: Number.isInteger(total) && total >= 0 ? total : null,
      maxCounts: normalizeMaxCounts(saved.maxCounts)
    };
  } catch (error) {
    return blank;
  }
}

function normalizeMaxCounts(raw) {
  const result = emptyMaxCounts();
  if (!raw || typeof raw !== "object") return result;
  ["rarities", "types", "sizes"].forEach((kind) => {
    const source = raw[kind];
    if (!source || typeof source !== "object") return;
    Object.keys(source).forEach((id) => {
      const value = Number(source[id]);
      if (Number.isInteger(value) && value >= 0) result[kind][id] = value;
    });
  });
  return result;
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
  error.scrollIntoView({ block: "nearest" });
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
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
  navigator.serviceWorker.register("./sw.js?v=44").catch(() => {});
}
