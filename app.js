"use strict";

const STORAGE_KEY = "magic-auction-items-v1";
const state = {
  data: null,
  board: null,
  selected: null,
  editing: null,
  mode: "new",
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
      fetch("data/auction.json"),
      fetch("data/treasures.json")
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
  $("#detail-list").addEventListener("submit", onDetailSubmit);
}

function emptyGroup() {
  return { rarity: "", type: "", size: "", count: "1", price: "", use: "known" };
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
  syncMode();
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
    label: String(size)
  })), "Size in tiles"));
  return entry;
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
  $("#fab").setAttribute("aria-label", open ? "Close add form" : "Add information");
  if (!open) return;
  const count = $("#sheet").querySelector(".group-count");
  if (count) count.focus();
}

function onSheetClick(event) {
  const modeButton = event.target.closest("[data-mode]");
  if (modeButton) {
    state.mode = modeButton.dataset.mode;
    syncMode();
    hideError();
    return;
  }

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
}

function syncMode() {
  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.setAttribute("aria-pressed", button.dataset.mode === state.mode ? "true" : "false");
  });
  const hint = $("#mode-hint");
  const hints = {
    new: "Each count adds that many treasures.",
    update: "Fills listed treasures first, then adds any remainder."
  };
  if (hint) hint.textContent = hints[state.mode] || hints.new;
  const submit = $("#sheet button[type='submit']");
  if (submit) submit.textContent = state.mode === "update" ? "Update" : "Add";
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
  state.mode = "new";
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
  if (itemSpecs.length && state.mode === "update") {
    const touched = applyUpdates(itemSpecs);
    if (touched === 0) {
      showError("Nothing could be updated or created.");
      return;
    }
  } else {
    itemSpecs.forEach((spec) => {
      for (let index = 0; index < spec.count; index += 1) {
        state.board.items.push(blankItem(factFrom(spec, index)));
      }
    });
  }
  if (totalSpecs.length === 1) state.board.treasureTotal = totalSpecs[0].count;
  applyMaxes(maxSpecs);

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

function applyUpdates(specs) {
  let touched = 0;
  specs.forEach((spec) => {
    const match = factFrom(spec, 0);
    if (spec.prices && spec.prices.length) delete match.price;
    if (!Object.keys(match).length && !(spec.prices && spec.prices.length)) {
      for (let index = 0; index < spec.count; index += 1) {
        state.board.items.push(blankItem({}));
        touched += 1;
      }
      return;
    }

    const ranked = state.board.items
      .map((item, index) => ({ item, index, score: updateScore(item, match) }))
      .filter((entry) => entry.score != null)
      .sort((a, b) => b.score - a.score || a.index - b.index);
    const take = Math.min(spec.count, ranked.length);
    for (let index = 0; index < take; index += 1) {
      writeFact(ranked[index].item, factFrom(spec, index));
      touched += 1;
    }
    for (let index = take; index < spec.count; index += 1) {
      state.board.items.push(blankItem(factFrom(spec, index)));
      touched += 1;
    }
  });
  return touched;
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

function updateScore(item, fact) {
  let score = 0;
  let missing = 0;
  const keys = Object.keys(fact);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (fieldEmpty(item, key)) {
      missing += 1;
      continue;
    }
    if (!sameFact(item[key], fact[key])) return null;
    score += 1;
  }
  return missing > 0 ? score : null;
}

function sameFact(current, wanted) {
  if (typeof wanted === "number") return Number(current) === wanted;
  return current === wanted;
}

function writeFact(item, fact) {
  Object.keys(fact).forEach((key) => {
    if (fieldEmpty(item, key)) item[key] = fact[key];
  });
}

function fieldEmpty(item, key) {
  const value = item[key];
  return value == null || value === "";
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
  const button = event.target.closest("[data-open]");
  if (!button || !state.board) return;
  const next = { kind: button.dataset.open, id: button.dataset.id };
  const same = state.selected && state.selected.kind === next.kind && state.selected.id === next.id;
  state.selected = same ? null : next;
  state.editing = null;
  render();
}

function onDetailClick(event) {
  const pick = event.target.closest("[data-edit]");
  if (pick) {
    const wasOn = pick.getAttribute("aria-pressed") === "true";
    pick.closest(".chips").querySelectorAll("[data-edit]").forEach((button) => {
      button.setAttribute("aria-pressed", "false");
    });
    if (!wasOn) pick.setAttribute("aria-pressed", "true");
    const error = pick.closest(".detail-editor")?.querySelector(".form-error");
    if (error) error.hidden = true;
    return;
  }

  const cancel = event.target.closest("[data-cancel-detail]");
  if (cancel) {
    state.editing = null;
    render();
    return;
  }

  const opener = event.target.closest("[data-detail]");
  if (opener) {
    state.editing = state.editing === opener.dataset.detail ? null : opener.dataset.detail;
    render();
    const price = document.querySelector(".detail-editor .detail-price-input");
    if (price) price.focus();
    return;
  }

  const button = event.target.closest("[data-remove]");
  if (!button) return;
  state.board.items = state.board.items.filter((item) => item.id !== button.dataset.remove);
  if (state.editing === button.dataset.remove) state.editing = null;
  if (state.selected && !matchingItems().length) state.selected = null;
  persist();
  render();
}

function onDetailSubmit(event) {
  event.preventDefault();
  const form = event.target.closest("[data-editor]");
  if (!form || !state.board) return;
  const item = state.board.items.find((entry) => entry.id === form.dataset.editor);
  if (!item) return;

  const chosen = (kind) => {
    const button = form.querySelector(`[data-edit="${kind}"][aria-pressed="true"]`);
    return button ? button.dataset.id : "";
  };
  const raw = form.querySelector(".detail-price-input")?.value || "";
  const price = parseCoins(raw);
  if (String(raw).trim() && Number.isNaN(price)) {
    const error = form.querySelector(".form-error");
    error.hidden = false;
    error.textContent = "Enter a price like 120000, 120k, or 1.2m. Do not put commas inside one price.";
    return;
  }

  item.rarity = chosen("rarity");
  item.type = chosen("type");
  item.size = chosen("size") ? Number(chosen("size")) : null;
  item.price = String(raw).trim() ? price : null;
  state.editing = null;
  if (state.selected && !matchingItems().length) state.selected = null;
  persist();
  render();
}

function buildDetailEditor(item) {
  const form = document.createElement("form");
  form.className = "detail-editor";
  form.dataset.editor = item.id;

  const priceLabel = document.createElement("label");
  priceLabel.className = "field";
  const priceName = document.createElement("span");
  priceName.textContent = "Exact price";
  const priceInput = document.createElement("input");
  priceInput.className = "detail-price-input";
  priceInput.inputMode = "decimal";
  priceInput.autocomplete = "off";
  priceInput.enterKeyHint = "done";
  priceInput.placeholder = "Optional, such as 120k or 1.2m";
  priceInput.value = item.price == null ? "" : String(item.price);
  priceInput.setAttribute("aria-label", "Exact price");
  priceLabel.append(priceName, priceInput);
  form.appendChild(priceLabel);

  form.appendChild(editChoices("Rarity", "rarity", "add-rarities", item.rarity || "", state.data.rarities.map((rarity) => ({
    id: rarity.id,
    label: rarity.name,
    color: rarity.color,
    ink: rarity.ink
  })), "Rarity"));
  form.appendChild(editChoices("Type", "type", "", item.type || "", state.data.types.map((type) => ({
    id: type.id,
    label: type.name
  })), "Type"));
  form.appendChild(editChoices("Size", "size", "add-sizes", item.size == null ? "" : String(item.size), state.data.sizePresets.map((size) => ({
    id: String(size),
    label: String(size)
  })), "Size in tiles"));

  const error = document.createElement("p");
  error.className = "form-error";
  error.hidden = true;

  const actions = document.createElement("div");
  actions.className = "detail-editor-actions";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "text-btn";
  cancel.dataset.cancelDetail = item.id;
  cancel.textContent = "Cancel";
  const save = document.createElement("button");
  save.type = "submit";
  save.className = "primary";
  save.textContent = "Save";
  actions.append(cancel, save);
  form.append(error, actions);
  return form;
}

function editChoices(legendText, kind, extraClass, current, options, ariaLabel) {
  const fieldset = document.createElement("fieldset");
  const legend = document.createElement("legend");
  legend.textContent = legendText;
  const chips = document.createElement("div");
  chips.className = extraClass ? `chips ${extraClass}` : "chips";
  chips.setAttribute("role", "group");
  chips.setAttribute("aria-label", ariaLabel);
  options.forEach((option) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip";
    button.dataset.edit = kind;
    button.dataset.id = option.id;
    button.textContent = option.label;
    button.setAttribute("aria-pressed", current === option.id ? "true" : "false");
    if (option.color) {
      button.style.setProperty("--chip", option.color);
      button.style.setProperty("--chip-ink", option.ink);
    }
    chips.appendChild(button);
  });
  fieldset.append(legend, chips);
  return fieldset;
}

function endGame() {
  if (!state.board) return;
  if (hasBoardInfo() && !window.confirm("End this game and clear the revealed information?")) return;
  state.board.items = [];
  state.board.treasureTotal = null;
  state.board.maxCounts = emptyMaxCounts();
  state.selected = null;
  state.editing = null;
  resetComposer();
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
    max: state.board.maxCounts.rarities[entry.id],
    color: entry.color,
    ink: entry.ink
  })));
  renderGroup($("#types"), $("#type-group"), "types", state.data.types.map((entry) => ({
    id: entry.id,
    label: entry.name,
    count: counts.types[entry.id] || 0,
    max: state.board.maxCounts.types[entry.id]
  })));
  renderGroup($("#sizes"), $("#size-group"), "sizes", state.data.sizePresets.map((size) => ({
    id: String(size),
    label: String(size),
    count: counts.sizes[String(size)] || 0,
    max: state.board.maxCounts.sizes[String(size)]
  })));
  $("#info-empty").hidden = hasBoardInfo();
  renderDetail();
  renderEstimate();
  renderExact();
  renderTreasureTotal();
}

function renderTreasureTotal() {
  const total = $("#treasure-total");
  if (!total) return;
  const value = state.board && state.board.treasureTotal;
  total.textContent = value == null ? "0" : String(value);
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
    }
    const name = document.createElement("span");
    name.textContent = entry.label;
    const count = document.createElement("span");
    count.className = "count";
    count.textContent = Number.isInteger(entry.max) ? `${entry.count}/${entry.max}` : String(entry.count);
    button.append(name, count);
    container.appendChild(button);
  });
}

function renderDetail() {
  const box = $("#detail");
  const items = matchingItems();
  const max = categoryMax(state.selected);
  if (!state.selected || (!items.length && max == null)) {
    box.hidden = true;
    $("#detail-list").replaceChildren();
    $("#detail-empty").hidden = true;
    return;
  }
  box.hidden = false;
  const label = selectionLabel(state.selected);
  $("#detail-title").textContent = max == null ? label : `${label} · ${items.length} of ${max}`;
  $("#detail-empty").hidden = items.length > 0;
  const list = $("#detail-list");
  list.replaceChildren();
  if (!items.length) return;
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
    const actions = document.createElement("div");
    actions.className = "detail-actions";
    const add = document.createElement("button");
    add.type = "button";
    add.className = "text-btn";
    add.dataset.detail = item.id;
    add.textContent = "Add detail";
    add.setAttribute("aria-expanded", state.editing === item.id ? "true" : "false");
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "text-btn";
    remove.dataset.remove = item.id;
    remove.textContent = "Remove";
    actions.append(add, remove);
    row.append(text, actions);
    if (state.editing === item.id) row.appendChild(buildDetailEditor(item));
    list.appendChild(row);
  });
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

function usesMaxConstraint(board) {
  if (!board || board.treasureTotal == null || !board.maxCounts) return false;
  return Object.keys(board.maxCounts.rarities || {}).some((id) => Number.isInteger(board.maxCounts.rarities[id]));
}

function catalogWorth(board, data, pickMax) {
  const treasures = data.treasures || [];
  const slots = estimateSlots(board);
  if (!slots.length || !treasures.length) return 0;
  const rooms = openRooms(board, data);
  const items = treasures.map((item, index) => ({ ...item, index }));
  items.sort((left, right) => {
    const diff = pickMax ? right.price - left.price : left.price - right.price;
    return diff || left.index - right.index;
  });
  const ordered = slots
    .map((slot, index) => ({
      slot,
      index,
      choices: treasures.filter((item) => matchesFacts(item, slot)).length
    }))
    .sort((left, right) => left.choices - right.choices || left.index - right.index);
  const used = new Set();
  return ordered.reduce((sum, entry) => {
    const taken = takeItem(items, used, entry.slot, rooms);
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
    if (!item.rarity && !active) return;
    slots.push({
      rarity: item.rarity || null,
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
    rarities: roomFor(board, data.rarities.map((entry) => entry.id), "rarities", (item) => item.rarity || ""),
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
  if (!slot.rarity && !(rooms.rarities[item.rarity] > 0)) return false;
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
  if (!slot.rarity && rooms.rarities[item.rarity] !== Infinity) rooms.rarities[item.rarity] -= 1;
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
  navigator.serviceWorker.register("./sw.js?v=24").catch(() => {});
}
