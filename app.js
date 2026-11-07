"use strict";

const STORAGE_KEY = "magic-auction-items-v1";
const state = {
  data: null,
  board: null,
  selected: null,
  detailOpen: null,
  groups: [emptyGroup()],
  johnsonIntroUsed: false
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
      fetch("data/auction.json?v=163"),
      fetch("data/treasures.json?v=163")
    ]);
    if (!auctionResponse.ok || !treasureResponse.ok) throw new Error("Auction data did not load.");
    state.data = await auctionResponse.json();
    state.data.treasures = await treasureResponse.json();
  } catch (error) {
    $("#load-error").hidden = false;
    $("#load-error").textContent = "Could not load the auction data. The tracker needs data/auction.json and data/treasures.json beside this page.";
    $("#scene-menu").hidden = true;
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
  document.querySelectorAll("[data-picker]").forEach((picker) => {
    const kind = picker.dataset.picker;
    picker.querySelector("select").addEventListener("change", () => onPickerChange(kind));
    picker.querySelector(".house-toggle").addEventListener("click", () => onPickerToggle(kind));
    picker.querySelector(".house-menu").addEventListener("click", (event) => onPickerPick(kind, event));
  });
  $("#known-toggle").addEventListener("click", onKnownToggle);
  $("#known-menu").addEventListener("click", closeKnownMenu);
  document.addEventListener("click", onPickerDismiss);
  document.addEventListener("keydown", onPickerKey);
  $("#end-game").addEventListener("click", endGame);
  $("#game-start").addEventListener("click", showGame);
  $("#crypto-open").addEventListener("click", openCrypto);
  $("#close-crypto").addEventListener("click", closeCrypto);
  $("#crypto-dialog").addEventListener("click", onCryptoClick);
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

function showMenu() {
  closePickers();
  $("#scene-menu").hidden = false;
  $("#scene-tracker").hidden = true;
  $("#fab").hidden = true;
  setSheet(false);
  closeCrypto();
  window.scrollTo(0, 0);
}

function showGame() {
  closePickers();
  $("#scene-menu").hidden = true;
  $("#scene-tracker").hidden = false;
  $("#fab").hidden = false;
  closeCrypto();
  window.scrollTo(0, 0);
}

function openCrypto() {
  const dialog = $("#crypto-dialog");
  if (dialog && !dialog.open) dialog.showModal();
}

function closeCrypto() {
  const dialog = $("#crypto-dialog");
  if (dialog && dialog.open) dialog.close();
}

function onCryptoClick(event) {
  if (event.target === event.currentTarget) {
    closeCrypto();
    return;
  }
  const button = event.target.closest("[data-copy]");
  if (!button) return;
  copyWallet(button);
}

function copyWallet(button) {
  const text = button.dataset.copy;
  const mark = () => {
    document.querySelectorAll(".crypto-copy").forEach((entry) => {
      entry.textContent = "Copy";
    });
    button.textContent = "Copied";
  };
  const fallback = () => {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.left = "-999px";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  };
  const write = navigator.clipboard && navigator.clipboard.writeText
    ? navigator.clipboard.writeText(text)
    : Promise.reject();
  const timed = Promise.race([
    write,
    new Promise((resolve, reject) => setTimeout(() => reject(new Error("copy")), 400))
  ]);
  timed.then(mark).catch(() => {
    if (fallback()) mark();
  });
}

function emptyDetail() {
  return { rarity: "", type: "", size: "", price: "", open: "" };
}

function emptyGroup() {
  return { rarity: "", type: "", size: "", count: "", price: "", use: "known", open: "", details: [] };
}

function johnsonGroup(rarity) {
  return { rarity, type: "", size: "", count: "", price: "", use: "both", open: "", details: [] };
}

function johnsonPreset() {
  return [johnsonGroup("gray"), johnsonGroup("green"), johnsonGroup("blue")];
}

function groupSignature(group) {
  const details = (group.details || []).map((detail) => [detail.rarity, detail.type, detail.size, detail.price, detail.open].join("\u0001")).join("\u0002");
  return [group.rarity, group.type, group.size, group.count, group.price, group.use, group.open, details].join("\0");
}

function sameGroups(left, right) {
  return left.length === right.length && left.every((group, index) => groupSignature(group) === groupSignature(right[index]));
}

function applyJohnsonIntro() {
  if (!state.board || state.board.hero !== "johnson" || state.johnsonIntroUsed) return;
  state.groups = johnsonPreset();
  state.johnsonIntroUsed = true;
  renderGroups();
}

function buildHouseOptions() {
  state.board.house = fillSelect($("#house"), state.data.houses, state.board.house);
  state.board.hero = fillSelect($("#hero"), state.data.heroes, state.board.hero);
  renderPicker("house");
  renderPicker("hero");
}

function fillSelect(select, entries, current) {
  entries.forEach((entry) => {
    const option = document.createElement("option");
    option.value = entry.id;
    option.textContent = entry.name;
    select.appendChild(option);
  });
  const known = entries.some((entry) => entry.id === current);
  const value = known ? current : entries[0].id;
  select.value = value;
  return value;
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
  countInput.addEventListener("wheel", (event) => {
    event.preventDefault();
  }, { passive: false });
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
  entry.appendChild(choiceField("Size", "size", "add-sizes", group, orderedSizePresets().map((size) => ({
    id: size,
    label: size
  })), "Size"));
  const specify = specifyBlock(group);
  if (specify) entry.appendChild(specify);
  return entry;
}

function specifyBlock(group) {
  const kinds = specifyKinds(group);
  if (!kinds.length) return null;
  const block = document.createElement("div");
  block.className = "specify";
  const pair = document.createElement("div");
  pair.className = kinds.length === 1 ? "specify-pair is-single" : "specify-pair";
  kinds.forEach((kind) => pair.appendChild(specifyColumn(group, kind, specifyLabel(kind))));
  block.appendChild(pair);
  const details = group.details || [];
  const index = details.findIndex((detail) => kinds.includes(detail.open));
  if (index < 0) return block;
  const detail = details[index];
  const panel = detailChoiceField(specifyLabel(detail.open), detail.open, specifyChipClass(detail.open), group, detail, specifyOptions(detail.open), `${specifyLabel(detail.open)} for this treasure`);
  panel.dataset.detail = String(index);
  block.appendChild(panel);
  return block;
}

function specifyKinds(group) {
  const chosen = ["rarity", "type", "size"].filter((kind) => group[kind]);
  if (!chosen.length) return [];
  return ["rarity", "type", "size"].filter((kind) => !group[kind]);
}

function specifyLabel(kind) {
  if (kind === "rarity") return "Rarity";
  if (kind === "type") return "Type";
  return "Size";
}

function specifyChipClass(kind) {
  if (kind === "rarity") return "add-rarities";
  if (kind === "size") return "add-sizes";
  return "";
}

function specifyOptions(kind) {
  if (kind === "rarity") {
    return state.data.rarities.map((rarity) => ({
      id: rarity.id,
      label: rarity.name,
      color: rarity.color,
      ink: rarity.ink
    }));
  }
  if (kind === "type") return state.data.types.map((type) => ({ id: type.id, label: type.name }));
  return orderedSizePresets().map((size) => ({ id: size, label: size }));
}

function specifyChipLabel(kind, id) {
  if (kind === "size") return sizeLabel(id);
  if (kind === "rarity") return rarityName(id);
  return typeName(id);
}

function paintRarityChip(chip, id) {
  const rarity = state.data.rarities.find((entry) => entry.id === id);
  if (!rarity) return;
  chip.style.setProperty("--chip", rarity.color);
  chip.style.setProperty("--chip-ink", rarity.ink);
}

function specifyColumn(group, kind, label) {
  const field = document.createElement("fieldset");
  const legend = document.createElement("legend");
  legend.textContent = label;
  const chips = document.createElement("div");
  chips.className = "chips";
  const details = group.details || [];
  const grouped = new Map();
  details.forEach((detail, index) => {
    const id = detail[kind];
    if (!id) return;
    if (!grouped.has(id)) grouped.set(id, { index, count: 0 });
    grouped.get(id).count += 1;
  });
  grouped.forEach((info, id) => chips.appendChild(specifyKnownChip(group, kind, id, info)));
  const shared = group[kind] || "";
  const sharedCount = shared ? sharedCountInGroup(group, kind) : 0;
  if (shared && sharedCount > 0) chips.appendChild(specifySharedChip(kind, shared, sharedCount));
  const unknown = unknownInGroup(group, kind);
  const locked = kind === "size" && group.type === "collection";
  if (!locked && unknown !== 0) chips.appendChild(specifyUnknownChip(group, kind, unknown));
  field.append(legend, chips);
  return field;
}

function specifyKnownChip(group, kind, id, info) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "chip is-on";
  button.dataset.specifyEdit = kind;
  button.dataset.detail = String(info.index);
  button.dataset.id = id;
  const open = group.details[info.index] && group.details[info.index].open === kind;
  button.classList.toggle("is-selected", open);
  button.setAttribute("aria-pressed", open ? "true" : "false");
  const name = document.createElement("span");
  name.textContent = specifyChipLabel(kind, id);
  if (kind === "rarity") paintRarityChip(button, id);
  const number = document.createElement("span");
  number.className = "count";
  number.textContent = kind === "size" ? `×${info.count}` : String(info.count);
  button.append(name, number);
  return button;
}

function specifySharedChip(kind, id, count) {
  const chip = document.createElement("span");
  chip.className = "chip is-on";
  const name = document.createElement("span");
  name.textContent = specifyChipLabel(kind, id);
  if (kind === "rarity") paintRarityChip(chip, id);
  const number = document.createElement("span");
  number.className = "count";
  number.textContent = kind === "size" ? `×${count}` : String(count);
  chip.append(name, number);
  return chip;
}

function specifyUnknownChip(group, kind, unknown) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "chip is-on";
  button.dataset.specifyUnknown = kind;
  button.style.setProperty("--chip", "#3a4154");
  button.style.setProperty("--chip-ink", "#f6f1e7");
  const editing = (group.details || []).some((detail) => detail.open === kind && !detail[kind]);
  button.classList.toggle("is-selected", editing);
  button.setAttribute("aria-pressed", editing ? "true" : "false");
  button.setAttribute("aria-label", unknown == null ? `Unknown ${kind}` : `Unknown ${kind}, ${unknown}`);
  const name = document.createElement("span");
  name.textContent = "Unknown";
  button.appendChild(name);
  if (unknown != null) {
    const number = document.createElement("span");
    number.className = "count";
    number.textContent = String(unknown);
    button.appendChild(number);
  }
  return button;
}

function unknownInGroup(group, kind) {
  const count = parseCount(group.count);
  const shared = group[kind] || "";
  const details = group.details || [];
  if (count == null) return shared ? 0 : null;
  let unknown = 0;
  for (let index = 0; index < count; index += 1) {
    const own = details[index] && details[index][kind];
    if (!own && !shared) unknown += 1;
  }
  return unknown;
}

function sharedCountInGroup(group, kind) {
  const count = parseCount(group.count);
  if (!group[kind] || count == null) return 0;
  const details = group.details || [];
  let shared = 0;
  for (let index = 0; index < count; index += 1) {
    if (!(details[index] && details[index][kind])) shared += 1;
  }
  return shared;
}

function clearCoveredDetails(group) {
  (group.details || []).forEach((detail) => {
    ["rarity", "type", "size"].forEach((kind) => {
      if (!group[kind]) return;
      detail[kind] = "";
      if (detail.open === kind) detail.open = "";
    });
  });
  pruneEmptyDetails(group);
}

function pruneEmptyDetails(group) {
  group.details = (group.details || []).filter((detail) => detail.open || detail.rarity || detail.type || detail.size || String(detail.price || "").trim());
}

function openSpecify(group, kind, index) {
  if (!group.details) group.details = [];
  if (kind === "size" && group.type === "collection") return;
  if (index >= 0) {
    const detail = group.details[index];
    if (!detail || (kind === "size" && detailType(group, detail) === "collection")) return;
    const next = detail.open === kind ? "" : kind;
    group.open = "";
    group.details.forEach((item, itemIndex) => {
      item.open = itemIndex === index ? next : "";
    });
    pruneEmptyDetails(group);
    rerenderGroups();
    hideError();
    return;
  }
  const openEmpty = group.details.findIndex((detail) => detail.open === kind && !detail[kind]);
  if (openEmpty >= 0) {
    group.details[openEmpty].open = "";
    pruneEmptyDetails(group);
    rerenderGroups();
    hideError();
    return;
  }
  let target = group.details.findIndex((detail) => !detail[kind] && !(kind === "size" && detailType(group, detail) === "collection"));
  if (target < 0) {
    const count = parseCount(group.count);
    const filled = group.details.filter((detail) => detail.rarity || detail.type || detail.size || String(detail.price || "").trim()).length;
    if (count != null && filled >= count) {
      showError("Every treasure in this count is already specified.");
      return;
    }
    group.details.push(emptyDetail());
    target = group.details.length - 1;
  }
  group.open = "";
  group.details.forEach((detail, itemIndex) => {
    detail.open = itemIndex === target ? kind : "";
  });
  rerenderGroups();
  hideError();
}

function detailFacts(group, detail) {
  return {
    rarity: detail.rarity || group.rarity || "",
    type: detail.type || group.type || "",
    size: detail.size || group.size || ""
  };
}

function detailType(group, detail) {
  return detail.type || group.type || "";
}

function detailChoiceField(legendText, kind, extraClass, group, detail, options, ariaLabel) {
  const fieldset = document.createElement("fieldset");
  fieldset.className = "cat-panel";
  fieldset.dataset.detailPanel = kind;
  const locked = kind === "size" && detailType(group, detail) === "collection";
  fieldset.hidden = locked || detail.open !== kind;
  const legend = document.createElement("legend");
  legend.textContent = legendText;
  const chips = document.createElement("div");
  chips.className = extraClass ? `chips ${extraClass}` : "chips";
  chips.setAttribute("role", "group");
  chips.setAttribute("aria-label", ariaLabel);
  options.forEach((option) => {
    const count = specifyAssigned(group, kind, option.id);
    const wrap = document.createElement("div");
    wrap.className = "chip-wrap";
    wrap.append(
      specifyStepButton(kind, option, "-1", count === 0),
      specifyCountChip(kind, option, count),
      specifyStepButton(kind, option, "1", !canAddSpecify(group, kind, option.id))
    );
    chips.appendChild(wrap);
  });
  fieldset.append(legend, chips);
  return fieldset;
}

function specifyAssigned(group, kind, id) {
  return (group.details || []).filter((detail) => detail[kind] === id).length;
}

function specifyStepButton(kind, option, delta, disabled) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "step-btn chip-adjust";
  button.dataset.specifyStep = delta;
  button.dataset.specifyKind = kind;
  button.dataset.specifyId = option.id;
  button.disabled = disabled;
  button.textContent = delta === "1" ? "+" : "−";
  button.setAttribute("aria-label", `${delta === "1" ? "Increase" : "Decrease"} ${option.label}`);
  return button;
}

function specifyCountChip(kind, option, count) {
  const chip = document.createElement("span");
  chip.className = count > 0 ? "chip is-on" : "chip";
  if (option.color) {
    chip.classList.add("is-swatch");
    chip.style.setProperty("--chip", option.color);
    chip.style.setProperty("--chip-ink", option.ink);
    const number = document.createElement("span");
    number.className = "count";
    number.textContent = String(count);
    chip.appendChild(number);
    chip.setAttribute("aria-label", `${option.label}, ${count}`);
    return chip;
  }
  const name = document.createElement("span");
  name.textContent = option.label;
  const number = document.createElement("span");
  number.className = "count";
  number.textContent = kind === "size" ? `×${count}` : String(count);
  chip.append(name, number);
  return chip;
}

function specifyFits(group, detail, kind, id) {
  if (kind === "size" && (group.type === "collection" || detailType(group, detail) === "collection")) return false;
  return catalogSupports(choiceFacts(detailFacts(group, detail), kind, id));
}

function canAddSpecify(group, kind, id) {
  const count = parseCount(group.count);
  if (count == null) return true;
  if (unknownInGroup(group, kind) === 0) return false;
  const details = group.details || [];
  if (details.some((detail) => !detail[kind] && specifyFits(group, detail, kind, id))) return true;
  if (details.length >= count) return false;
  return specifyFits(group, emptyDetail(), kind, id);
}

function addSpecify(group, kind, id) {
  if (!group.details) group.details = [];
  const count = parseCount(group.count);
  if (count == null) {
    showError("Enter a whole number of at least 1 for each group.");
    return;
  }
  if (unknownInGroup(group, kind) === 0) {
    showError("Every treasure in this count is already specified.");
    return;
  }
  let index = group.details.findIndex((detail) => !detail[kind] && specifyFits(group, detail, kind, id));
  if (index < 0) {
    if (group.details.length >= count || !specifyFits(group, emptyDetail(), kind, id)) return;
    group.details.push(emptyDetail());
    index = group.details.length - 1;
  }
  const detail = group.details[index];
  detail[kind] = id;
  if (kind === "type" && id === "collection") {
    detail.size = collectionShape();
    if (detail.open === "size") detail.open = "";
  }
  rerenderGroups();
  hideError();
}

function removeSpecify(group, kind, id) {
  const details = group.details || [];
  let index = -1;
  for (let cursor = details.length - 1; cursor >= 0; cursor -= 1) {
    if (details[cursor][kind] !== id) continue;
    if (kind === "size" && detailType(group, details[cursor]) === "collection") continue;
    index = cursor;
    break;
  }
  if (index < 0) return;
  const detail = details[index];
  detail[kind] = "";
  if (kind === "type" && id === "collection" && detail.size === collectionShape()) detail.size = "";
  pruneEmptyDetails(group);
  rerenderGroups();
  hideError();
}

function rerenderGroups() {
  const sheet = $("#sheet");
  const top = sheet ? sheet.scrollTop : 0;
  renderGroups();
  if (sheet) sheet.scrollTop = top;
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
  const locked = kind === "size" && group.type === "collection";
  button.disabled = locked;
  const open = group.open === kind && !locked;
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
    return { label: sizeLabel(group.size, group.type), color: "", ink: "" };
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
    const selected = group[kind] === option.id;
    button.setAttribute("aria-pressed", selected ? "true" : "false");
    button.disabled = !selected && !catalogSupports(choiceFacts(group, kind, option.id));
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

const pickers = {
  hero: { select: "#hero", menu: "#hero-menu", current: "#hero-current", toggle: "#hero-toggle", root: "#hero-picker" },
  house: { select: "#house", menu: "#house-menu", current: "#house-current", toggle: "#house-toggle", root: "#house-picker" }
};

function pickerEntries(kind) {
  return kind === "hero" ? state.data.heroes : state.data.houses;
}

function onPickerChange(kind) {
  if (!state.board) return;
  state.board[kind] = $(pickers[kind].select).value;
  persist();
  render();
  renderPicker(kind);
  if (kind === "hero" && state.board.hero !== "johnson" && sameGroups(state.groups, johnsonPreset())) {
    state.groups = [emptyGroup()];
    renderGroups();
  }
}

function renderPicker(kind) {
  const picker = pickers[kind];
  const menu = $(picker.menu);
  const current = $(picker.current);
  if (!menu || !current || !state.data) return;
  const selected = $(picker.select).value;
  const entries = pickerEntries(kind);
  const chosen = entries.find((entry) => entry.id === selected);
  current.textContent = chosen ? chosen.name : "";
  menu.replaceChildren();
  entries.forEach((entry) => {
    const item = document.createElement("li");
    item.className = "house-option";
    item.setAttribute("role", "option");
    item.dataset.value = entry.id;
    item.setAttribute("aria-selected", entry.id === selected ? "true" : "false");
    item.textContent = entry.name;
    menu.appendChild(item);
  });
}

function setPickerOpen(kind, open) {
  const picker = pickers[kind];
  const menu = $(picker.menu);
  const toggle = $(picker.toggle);
  if (!menu || !toggle) return;
  menu.hidden = !open;
  toggle.setAttribute("aria-expanded", open ? "true" : "false");
}

function closePickers() {
  Object.keys(pickers).forEach((kind) => setPickerOpen(kind, false));
  closeKnownMenu();
}

function closeKnownMenu() {
  const menu = $("#known-menu");
  const toggle = $("#known-toggle");
  if (!menu || !toggle) return;
  menu.hidden = true;
  toggle.setAttribute("aria-expanded", "false");
}

function onKnownToggle(event) {
  event.stopPropagation();
  const opening = $("#known-menu").hidden;
  closePickers();
  if (!opening) return;
  $("#known-menu").hidden = false;
  $("#known-toggle").setAttribute("aria-expanded", "true");
}

function onPickerToggle(kind) {
  const opening = $(pickers[kind].menu).hidden;
  closePickers();
  if (opening) setPickerOpen(kind, true);
}

function onPickerPick(kind, event) {
  const option = event.target.closest("[data-value]");
  if (!option) return;
  $(pickers[kind].select).value = option.dataset.value;
  $(pickers[kind].select).dispatchEvent(new Event("change"));
  setPickerOpen(kind, false);
}

function onPickerDismiss(event) {
  if (event.target.closest("[data-picker], #known-picker")) return;
  closePickers();
}

function onPickerKey(event) {
  if (event.key === "Escape") closePickers();
}

function setSheet(open) {
  if (open) applyJohnsonIntro();
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

  const specifyUnknown = event.target.closest("[data-specify-unknown]");
  if (specifyUnknown) {
    captureInputs();
    const entry = specifyUnknown.closest("[data-group]");
    const group = entry && state.groups[Number(entry.dataset.group)];
    if (!group) return;
    openSpecify(group, specifyUnknown.dataset.specifyUnknown, -1);
    return;
  }

  const specifyEdit = event.target.closest("[data-specify-edit]");
  if (specifyEdit) {
    captureInputs();
    const entry = specifyEdit.closest("[data-group]");
    const group = entry && state.groups[Number(entry.dataset.group)];
    if (!group) return;
    openSpecify(group, specifyEdit.dataset.specifyEdit, Number(specifyEdit.dataset.detail));
    return;
  }

  const step = event.target.closest("[data-specify-step]");
  if (step) {
    captureInputs();
    const entry = step.closest("[data-group]");
    const group = entry && state.groups[Number(entry.dataset.group)];
    if (!group) return;
    if (Number(step.dataset.specifyStep) < 0) removeSpecify(group, step.dataset.specifyKind, step.dataset.specifyId);
    else addSpecify(group, step.dataset.specifyKind, step.dataset.specifyId);
    return;
  }

  const detailPick = event.target.closest("[data-detail-pick]");
  if (detailPick) {
    const entry = detailPick.closest("[data-group]");
    const row = detailPick.closest("[data-detail]");
    const group = entry && state.groups[Number(entry.dataset.group)];
    const detail = group && group.details && group.details[Number(row.dataset.detail)];
    if (!detail) return;
    const kind = detailPick.dataset.detailPick;
    const next = detailPick.dataset.id;
    detail[kind] = detail[kind] === next ? "" : next;
    if (kind === "type") {
      if (detail.type === "collection") {
        detail.size = collectionShape();
        if (detail.open === "size") detail.open = "";
      } else if (detail.size === collectionShape()) detail.size = "";
    }
    rerenderGroups();
    hideError();
    return;
  }

  const category = event.target.closest("[data-open-cat]");
  if (category) {
    const entry = category.closest("[data-group]");
    if (!entry) return;
    const group = state.groups[Number(entry.dataset.group)];
    if (!group) return;
    const kind = category.dataset.openCat;
    if (kind === "size" && group.type === "collection") return;
    const next = group.open === kind ? "" : kind;
    (group.details || []).forEach((detail) => { detail.open = ""; });
    pruneEmptyDetails(group);
    group.open = next;
    rerenderGroups();
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
  if (kind === "type") lockCollectionGroup(group);
  clearCoveredDetails(group);
  rerenderGroups();
  hideError();
}

function onSheetInput(event) {
  const entry = event.target.closest("[data-group]");
  if (!entry) return;
  const group = state.groups[Number(entry.dataset.group)];
  if (!group) return;
  if (event.target.classList.contains("group-count")) {
    group.count = event.target.value;
    const index = entry.dataset.group;
    const caret = event.target.selectionStart;
    rerenderGroups();
    const again = document.querySelector(`#groups .entry[data-group="${index}"] .group-count`);
    if (again) {
      again.focus();
      if (caret != null) again.setSelectionRange(caret, caret);
    }
    hideError();
    return;
  }
  if (event.target.classList.contains("group-price")) group.price = event.target.value;
  if (event.target.classList.contains("specify-price")) {
    const row = event.target.closest("[data-detail]");
    const detail = row && group.details && group.details[Number(row.dataset.detail)];
    if (detail) detail.price = event.target.value;
  }
  if (event.target.classList.contains("group-use")) {
    group.use = event.target.value;
    entry.classList.toggle("is-max", group.use === "max");
  }
  hideError();
}

function syncGroupChips(entry, group) {
  entry.querySelectorAll("[data-pick]").forEach((button) => {
    const selected = group[button.dataset.pick] === button.dataset.id;
    button.setAttribute("aria-pressed", selected ? "true" : "false");
    button.disabled = !selected && !catalogSupports(choiceFacts(group, button.dataset.pick, button.dataset.id));
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
    entry.querySelectorAll("[data-detail]").forEach((row) => {
      const detail = group.details && group.details[Number(row.dataset.detail)];
      const specified = row.querySelector(".specify-price");
      if (detail && specified) detail.price = specified.value;
    });
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
    const details = use === "max" ? [] : (group.details || []).filter((detail) => detail.rarity || detail.type || detail.size || String(detail.price || "").trim()).map((detail) => {
      const raw = String(detail.price || "").trim();
      const picked = { rarity: detail.rarity || "", type: detail.type || "", size: detail.size || "" };
      if (!raw) return Object.assign(picked, { price: null });
      const price = parseCoins(raw);
      if (Number.isNaN(price)) return { error: true };
      return Object.assign(picked, { price });
    });
    if (details.some((detail) => detail.error)) {
      showError("Enter a price like 120000, 120k, or 1.2m.");
      return;
    }
    if (details.length > count) {
      showError("Specify at most as many treasures as the count.");
      return;
    }
    const spec = {
      count,
      rarity: group.rarity || "",
      type: group.type || "",
      size: group.size || null,
      prices: prices.prices,
      use,
      details
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

  const over = additionPastMax(parsed);
  if (over) {
    showError(`${over.label} would be ${over.count}/${over.max}.`);
    return;
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
      const detail = spec.details && index < spec.details.length ? spec.details[index] : null;
      state.board.items.push(blankItem(itemFact(spec, detail, index)));
    }
  });
  const firstRarityMax = new Set();
  maxSpecs.forEach((spec) => {
    if (spec.use === "max" && spec.rarity && !Number.isInteger(state.board.maxCounts.rarities[spec.rarity])) {
      firstRarityMax.add(spec.rarity);
    }
  });
  if (totalSpecs.length === 1) state.board.treasureTotal = totalSpecs[0].count;
  applyMaxes(maxSpecs);
  firstRarityMax.forEach((rarity) => revealUnknownForMax(rarity, state.board.maxCounts.rarities[rarity]));

  resetComposer();
  setSheet(false);
  persist();
  render();
}

function applyMaxes(specs) {
  specs.forEach((spec) => {
    categoryPicks(spec).forEach((picked) => {
      const current = state.board.maxCounts[picked.kind][picked.id];
      state.board.maxCounts[picked.kind][picked.id] = Number.isInteger(current) ? current + spec.count : spec.count;
    });
  });
}

function revealUnknownForMax(rarity, count) {
  const board = state.board;
  const known = board.items.filter((item) => item.rarity === rarity).length;
  const unrated = board.items.filter((item) => !item.rarity).length;
  let make = Math.max(0, count - known - unrated);
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

function atCategoryMax(kind, id) {
  if (!state.board || id == null || id === "" || id === "unknown") return false;
  const key = kind === "sizes" ? sizeKey(id) : String(id);
  const max = state.board.maxCounts?.[kind]?.[key];
  if (!Number.isInteger(max)) return false;
  const counts = tally(state.board.items, state.data);
  return (counts[kind]?.[key] || 0) >= max;
}

function assigningWouldExceed(kind, id, item) {
  if (!id) return false;
  const next = kind === "sizes" ? sizeKey(id) : id;
  const current = kind === "rarities"
    ? item.rarity
    : kind === "types"
      ? item.type
      : item.size == null ? "" : sizeKey(item.size);
  if (current === next) return false;
  return atCategoryMax(kind, next);
}

function fillWouldExceed(item, treasure) {
  if (!item.rarity && treasure.rarity && atCategoryMax("rarities", treasure.rarity)) return true;
  if (!item.type && treasure.type && atCategoryMax("types", treasure.type)) return true;
  if (item.size == null && (treasure.shape || treasure.size != null)) {
    const size = treasureShape(treasure) || sizeKey(treasure.size);
    if (size && atCategoryMax("sizes", size)) return true;
  }
  return false;
}

function additionPastMax(specs) {
  const counts = tally(state.board.items, state.data);
  const maxes = {
    rarities: Object.assign({}, state.board.maxCounts.rarities),
    types: Object.assign({}, state.board.maxCounts.types),
    sizes: Object.assign({}, state.board.maxCounts.sizes)
  };
  const added = { rarities: {}, types: {}, sizes: {} };
  specs.forEach((spec) => {
    const picks = categoryPicks(spec);
    if (spec.use === "max" || spec.use === "both") {
      picks.forEach((picked) => {
        const current = maxes[picked.kind][picked.id];
        maxes[picked.kind][picked.id] = Number.isInteger(current) ? current + spec.count : spec.count;
      });
    }
    if (spec.use === "max") return;
    const listed = spec.details || [];
    for (let index = 0; index < spec.count; index += 1) {
      const detail = index < listed.length ? listed[index] : null;
      const fact = itemFact(spec, detail, index);
      if (fact.rarity) noteAdded(counts, added, "rarities", fact.rarity);
      if (fact.type) noteAdded(counts, added, "types", fact.type);
      if (fact.size != null && fact.size !== "") noteAdded(counts, added, "sizes", String(fact.size));
    }
  });
  for (const kind of ["rarities", "types", "sizes"]) {
    for (const id of Object.keys(added[kind])) {
      const max = maxes[kind][id];
      const count = counts[kind][id] || 0;
      if (Number.isInteger(max) && count > max) {
        const label = kind === "rarities" ? rarityName(id) : kind === "types" ? typeName(id) : sizeLabel(id);
        return { label, count, max };
      }
    }
  }
  return null;
}

function hasBoardInfo() {
  if (!state.board) return false;
  if (state.board.items.length || state.board.treasureTotal != null) return true;
  const maxes = state.board.maxCounts;
  if (!maxes) return false;
  return ["rarities", "types", "sizes"].some((kind) => Object.keys(maxes[kind] || {}).length > 0);
}

function noteAdded(counts, added, kind, id) {
  counts[kind][id] = (counts[kind][id] || 0) + 1;
  added[kind][id] = true;
}

function itemFact(spec, detail, index) {
  const fact = {};
  const rarity = (detail && detail.rarity) || spec.rarity || "";
  const type = (detail && detail.type) || spec.type || "";
  const size = (detail && detail.size) || spec.size;
  if (rarity) fact.rarity = rarity;
  if (type) fact.type = type;
  if (size != null && size !== "") fact.size = size;
  const price = detail && detail.price != null ? detail.price : priceAt(spec, index);
  if (price != null) fact.price = price;
  return fact;
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
  state.detailOpen = state.selected && state.selected.id === "unknown"
    ? (blockingKind(state.selected.kind) || state.selected.kind)
    : null;
  render();
}

function onDetailClick(event) {
  const choose = event.target.closest("[data-choose]");
  if (choose) {
    const from = state.selected && state.selected.kind;
    state.selected = { kind: choose.dataset.choose, id: choose.dataset.id };
    state.detailOpen = from && from !== choose.dataset.choose ? from : null;
    render();
    return;
  }
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
  if (atCategoryMax(field, id) || blockedByMaxedCategory(facts)) return false;
  const open = openDonors(facts, field, id)
    .sort((left, right) => detailSpecificity(left) - detailSpecificity(right));
  if (open.length) {
    writeDetailFact(open[0], field, id);
    if (field === "types" && id === "collection") open[0].size = collectionShape();
    return true;
  }
  if (slotsLeft() < 1) return false;
  const created = freshFacts(facts, field, id);
  if (!created) return false;
  state.board.items.push(blankItem(created));
  return true;
}

function decreaseChild(facts, field, id) {
  const specific = Object.assign({}, facts);
  writeDetailFact(specific, field, id);
  const match = state.board.items
    .filter((item) => itemMatches(item, specific) && !exactTreasure(item) && (field !== "sizes" || item.type !== "collection"))
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
  state.johnsonIntroUsed = false;
  resetComposer();
  setSheet(false);
  persist();
  render();
  showMenu();
}

function render() {
  if (resolveUnknown() || resolveExactItems()) persist();
  const house = state.data.houses.find((entry) => entry.id === state.board.house);
  const houseName = $("#house-name");
  if (houseName) houseName.textContent = house ? house.name : "";
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
  renderGroup($("#sizes"), $("#size-group"), "sizes", orderedSizePresets().map((size) => ({
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
  renderKnown();
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
  total.textContent = Number.isInteger(cap) ? `${recorded}/${cap}` : String(recorded);
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
      chipAdjust("-1", kind, entry.id, !canDecrease({}, kind, entry.id)),
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

function canDecrease(facts, field, id) {
  if (id === "unknown") return false;
  const specific = Object.assign({}, facts);
  writeDetailFact(specific, field, id);
  return state.board.items.some((item) => itemMatches(item, specific) && !exactTreasure(item) && (field !== "sizes" || item.type !== "collection"));
}

function canAssign(facts, field, id) {
  if (id === "unknown" || atCategoryMax(field, id) || blockedByMaxedCategory(facts)) return false;
  const pool = Object.assign({}, facts);
  writeDetailFact(pool, field, "unknown");
  if (openDonors(pool, field, id).length > 0) return true;
  return slotsLeft() > 0 && freshFacts(facts, field, id) != null;
}

function slotsLeft() {
  const total = state.board && state.board.treasureTotal;
  if (!Number.isInteger(total)) return 0;
  return Math.max(0, total - state.board.items.length);
}

function freshFacts(facts, field, id) {
  const created = Object.assign({}, facts);
  writeDetailFact(created, field, id);
  if (field === "types" && id === "collection") {
    if (atCategoryMax("sizes", collectionShape())) return null;
    created.size = collectionShape();
  }
  const probe = {
    rarity: created.rarity || "",
    type: created.type || "",
    size: created.size == null || created.size === "" ? null : created.size
  };
  if (!catalogSupports(probe)) return null;
  return probe;
}

function blockedByMaxedCategory(facts) {
  return ["rarities", "types", "sizes"].some((kind) => fullyMaxedKind(kind) && !factSpecified(facts, kind));
}

function blockingKind(selectedKind) {
  return ["rarities", "types", "sizes"].find((kind) => kind !== selectedKind && fullyMaxedKind(kind)) || null;
}

function fullyMaxedKind(kind) {
  if (!state.board || unknownCount(state.board, kind) > 0) return false;
  const counts = tally(state.board.items, state.data);
  const ids = Object.keys(counts[kind] || {}).filter((id) => counts[kind][id] > 0);
  return ids.length > 0 && ids.every((id) => atCategoryMax(kind, id));
}

function factSpecified(facts, kind) {
  if (!facts) return false;
  if (kind === "rarities") return Boolean(facts.rarity && facts.rarity !== "unknown");
  if (kind === "types") return Boolean(facts.type && facts.type !== "unknown");
  return facts.size != null && facts.size !== "";
}

function factKind(field) {
  if (field === "rarities") return "rarity";
  if (field === "types") return "type";
  return "size";
}

function openDonors(facts, field, id) {
  return state.board.items.filter((item) => {
    if (!itemMatches(item, facts) || !childUnset(item, field) || exactTreasure(item)) return false;
    if (field === "sizes" && item.type === "collection") return false;
    return catalogSupports(choiceFacts(item, factKind(field), id));
  });
}

function parentFacts(selected) {
  if (!selected) return {};
  if (selected.kind === "rarities") return { rarity: selected.id === "unknown" ? "" : selected.id };
  if (selected.kind === "types") return { type: selected.id === "unknown" ? "" : selected.id };
  return { size: selected.id === "unknown" ? null : selected.id };
}

function writeDetailFact(facts, field, id) {
  if (field === "rarities") facts.rarity = id === "unknown" ? "" : id;
  else if (field === "types") facts.type = id === "unknown" ? "" : id;
  else facts.size = id === "unknown" ? null : id;
}

function itemMatches(item, facts) {
  if (Object.prototype.hasOwnProperty.call(facts, "rarity")) {
    if (facts.rarity ? item.rarity !== facts.rarity : Boolean(item.rarity)) return false;
  }
  if (Object.prototype.hasOwnProperty.call(facts, "type")) {
    if (facts.type ? item.type !== facts.type : Boolean(item.type)) return false;
  }
  if (Object.prototype.hasOwnProperty.call(facts, "size")) {
    if (facts.size != null ? sizeKey(item.size) !== sizeKey(facts.size) : item.size != null) return false;
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
  return orderedSizePresets().map((size) => ({ id: size, label: sizeLabel(size) }));
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
  $("#detail-title").textContent = max == null ? label : `${label} · ${items.length}/${max}`;
  $("#detail-empty").hidden = items.length > 0 || unknownOpen;
  const list = $("#detail-list");
  list.className = "detail-cats";
  list.replaceChildren();
  if (!items.length && !unknownOpen) return;
  const levels = detailLevels(state.selected);
  const parent = parentFacts(state.selected);
  levels.forEach((field) => {
    if (asksForChoice(field)) {
      const row = document.createElement("li");
      row.className = "detail-cat is-open";
      row.appendChild(choicePrompt(field));
      list.appendChild(row);
      return;
    }
    const sizeLocked = field === "sizes" && parent.type === "collection";
    const filled = filledCount(parent, field);
    const open = state.detailOpen === field && !sizeLocked;
    const row = document.createElement("li");
    row.className = open ? "detail-cat is-open" : "detail-cat";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "detail-cat-btn";
    button.dataset.openField = field;
    button.disabled = sizeLocked;
    button.setAttribute("aria-expanded", open ? "true" : "false");
    const name = document.createElement("span");
    name.textContent = fieldLabel(field);
    const total = unknown ? unknownCount(state.board, state.selected.kind) : items.length;
    const count = document.createElement("span");
    count.className = "count";
    count.textContent = total ? `${filled}/${total}` : String(filled);
    button.append(name, count);
    row.appendChild(button);
    if (open) {
      const choices = document.createElement("ul");
      choices.className = "detail-list";
      rowsFor(field, parent, unknown && field === state.selected.kind).forEach((choice) => {
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

function asksForChoice(field) {
  return isUnknownSelection(state.selected) && fullyMaxedKind(field) && field !== state.selected.kind;
}

function choicePrompt(field) {
  const wrap = document.createElement("div");
  wrap.className = "choice-ask";
  const question = document.createElement("p");
  question.className = "choice-question";
  question.textContent = `Which ${choiceNoun(field)} do you want to add a ${choiceNoun(state.selected.kind)} to?`;
  const choices = document.createElement("div");
  choices.className = "choice-options";
  rowsFor(field, parentFacts(state.selected), false).forEach((choice) => {
    if (choice.id === "unknown") return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip is-on";
    button.dataset.choose = field;
    button.dataset.id = choice.id;
    button.textContent = choice.label;
    if (choice.color) {
      button.style.setProperty("--chip", choice.color);
      button.style.setProperty("--chip-ink", choice.ink || "#1b1e26");
    }
    choices.appendChild(button);
  });
  wrap.append(question, choices);
  return wrap;
}

function choiceNoun(kind) {
  if (kind === "rarities") return "color";
  if (kind === "types") return "type";
  return "size";
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
  const treasure = exactTreasure(item);
  const card = document.createElement("div");
  card.className = treasure ? "item-card is-locked" : "item-card";
  card.dataset.item = item.id;
  if (item.rarity) {
    const rarity = state.data.rarities.find((entry) => entry.id === item.rarity);
    if (rarity) card.style.borderColor = rarity.color;
  }
  if (treasure) {
    const titleRow = document.createElement("div");
    titleRow.className = "item-name-row";
    const title = document.createElement("p");
    title.className = "item-name";
    title.textContent = treasure.name;
    titleRow.append(title, itemRemoveButton(item));
    card.appendChild(titleRow);
  }
  card.append(
    itemPriceField(item, Boolean(treasure)),
    itemFactSelect(item, "rarity", Boolean(treasure)),
    itemFactSelect(item, "type", Boolean(treasure)),
    itemFactSelect(item, "size", Boolean(treasure))
  );
  const choices = treasure ? [] : matchingTreasures(item);
  if (choices.length > 1 && choices.length <= 6) card.appendChild(itemNameField(item, choices));
  return card;
}

function itemRemoveButton(item) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "minus";
  button.textContent = "−";
  button.setAttribute("aria-label", `Remove ${exactTreasure(item)?.name || "item"}`);
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    removeLockedItem(item.id);
  });
  return button;
}

function removeLockedItem(id) {
  if (!state.board) return;
  const index = state.board.items.findIndex((entry) => entry.id === id);
  if (index < 0) return;
  state.board.items.splice(index, 1);
  persist();
  render();
}

function itemNameField(item, choices) {
  const label = document.createElement("label");
  label.className = "field";
  const name = document.createElement("span");
  name.textContent = "Name";
  const select = document.createElement("select");
  select.dataset.itemField = "name";
  select.setAttribute("aria-label", "Name");
  const blank = document.createElement("option");
  blank.value = "";
  blank.textContent = "Unknown";
  select.appendChild(blank);
  choices.forEach((treasure) => {
    const option = document.createElement("option");
    option.value = treasure.name;
    option.textContent = treasure.name;
    select.appendChild(option);
  });
  select.value = choices.some((treasure) => treasure.name === item.catalogName) ? item.catalogName : "";
  label.append(name, select);
  return label;
}

function itemPriceField(item, locked) {
  const label = document.createElement("label");
  label.className = "field item-price";
  const name = document.createElement("span");
  name.textContent = "Exact price";
  const input = document.createElement("input");
  input.dataset.itemField = "price";
  input.inputMode = "text";
  input.autocomplete = "off";
  input.enterKeyHint = "done";
  input.placeholder = "120k or 1.2m";
  input.value = item.price == null ? "" : String(item.price);
  input.disabled = locked;
  input.setAttribute("aria-label", "Exact price");
  label.append(name, input);
  return label;
}

function itemFactSelect(item, field, locked) {
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
      if (entry.id !== item.rarity && (atCategoryMax("rarities", entry.id) || !catalogSupports(choiceFacts(item, "rarity", entry.id)))) return;
      const option = document.createElement("option");
      option.value = entry.id;
      option.textContent = entry.name;
      select.appendChild(option);
    });
    select.value = item.rarity || "";
  } else if (field === "type") {
    state.data.types.forEach((entry) => {
      if (entry.id !== item.type && (atCategoryMax("types", entry.id) || !catalogSupports(choiceFacts(item, "type", entry.id)))) return;
      const option = document.createElement("option");
      option.value = entry.id;
      option.textContent = entry.name;
      select.appendChild(option);
    });
    select.value = item.type || "";
  } else {
    state.data.sizePresets.forEach((size) => {
      if (sizeKey(size) !== sizeKey(item.size) && (atCategoryMax("sizes", size) || !catalogSupports(choiceFacts(item, "size", size)))) return;
      const option = document.createElement("option");
      option.value = String(size);
      option.textContent = String(size);
      select.appendChild(option);
    });
    select.value = item.size == null ? "" : sizeKey(item.size);
    if (item.type === "collection") {
      select.value = collectionShape();
      select.disabled = true;
    }
  }
  if (locked) select.disabled = true;
  label.append(name, select);
  return label;
}

function onItemEdit(event) {
  const card = event.target.closest("[data-item]");
  if (!card || !state.board) return;
  const item = state.board.items.find((entry) => entry.id === card.dataset.item);
  if (!item || exactTreasure(item)) return;
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
  } else if (field === "rarity") {
    if (assigningWouldExceed("rarities", event.target.value, item)) {
      render();
      return;
    }
    item.rarity = event.target.value;
  } else if (field === "type") {
    if (assigningWouldExceed("types", event.target.value, item)) {
      render();
      return;
    }
    if (event.target.value === "collection" && sizeKey(item.size) !== collectionShape() && atCategoryMax("sizes", collectionShape())) {
      render();
      return;
    }
    item.type = event.target.value;
    if (item.type === "collection") item.size = collectionShape();
  } else if (field === "size") {
    if (item.type === "collection") return;
    if (assigningWouldExceed("sizes", event.target.value, item)) {
      render();
      return;
    }
    item.size = event.target.value || null;
    if (item.catalogName && !matchingTreasures(item).some((treasure) => treasure.name === item.catalogName)) delete item.catalogName;
  } else if (field === "name") {
    const chosen = state.data.treasures.find((treasure) => treasure.name === event.target.value);
    if (!chosen) delete item.catalogName;
    else if (fillWouldExceed(item, chosen)) {
      render();
      return;
    } else {
      item.catalogName = chosen.name;
      if (!item.rarity && chosen.rarity) item.rarity = chosen.rarity;
      if (!item.type && chosen.type) item.type = chosen.type;
      if (item.size == null) item.size = treasureShape(chosen) || sizeKey(chosen.size);
      if (item.price == null) item.price = Number(chosen.price);
    }
  } else return;
  persist();
  render();
}

function rowsFor(kind, parent, hideUnknown) {
  const pool = Object.assign({}, parent);
  writeDetailFact(pool, kind, "unknown");
  const rows = levelChoices(kind).map((choice) => {
    const facts = Object.assign({}, parent);
    writeDetailFact(facts, kind, choice.id);
    return Object.assign({}, choice, { count: countFacts(facts) });
  }).filter((choice) => {
    if (hideUnknown) return !atCategoryMax(kind, choice.id);
    return choice.count > 0 || openDonors(pool, kind, choice.id).length > 0;
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
  row.append(label, stepper(choice.count, field, choice.id, null, null, canAssign(facts, field, choice.id), canDecrease(facts, field, choice.id)));
  return row;
}

function stepper(count, field, id, childField, childId, canIncrease, canLower) {
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
  down.disabled = canLower === false || count < 1;
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
  $("#recommended-bid").textContent = formatCoins(recommendedBid(state.board, state.data));
}

function recommendedBid(board, data) {
  const worth = recommendationWorth(board, data);
  return worth > 0 ? Math.round(worth * 0.9) : 0;
}

function recommendationWorth(board, data) {
  if (!board) return 0;
  const mins = rarityMinimums(data);
  const counts = tally(board.items || [], data);
  let priced = 0;
  let specific = 0;
  const rarityCounts = {};
  let colorless = 0;
  (board.items || []).forEach((item) => {
    if (item.price != null && Number.isFinite(Number(item.price))) {
      priced += Number(item.price);
      return;
    }
    if (hasTypeOrSize(item) && item.rarity && item.rarity !== "unknown") {
      specific += lowestPossibleWorth(board, data, item, counts);
      return;
    }
    if (item.rarity && item.rarity !== "unknown" && mins[item.rarity] != null) {
      rarityCounts[item.rarity] = (rarityCounts[item.rarity] || 0) + 1;
      return;
    }
    colorless += 1;
  });
  const rarityWorth = Object.entries(rarityCounts).reduce((sum, [rarity, count]) => {
    return sum + mins[rarity] * 3 * count;
  }, 0);
  const remaining = colorless + unlistedSlots(board);
  return priced + specific + rarityWorth + unknownColorWorth(board, data, mins, remaining);
}

function hasTypeOrSize(item) {
  return Boolean(item.type && item.type !== "unknown") || (item.size != null && item.size !== "");
}

function lowestPossibleWorth(board, data, item, counts) {
  let lowest = null;
  ((data && data.treasures) || []).forEach((treasure) => {
    const price = Number(treasure.price);
    if (!Number.isFinite(price) || !treasurePossible(board, item, treasure, counts)) return;
    if (lowest == null || price < lowest) lowest = price;
  });
  return lowest == null ? 0 : lowest;
}

function treasurePossible(board, item, treasure, counts) {
  const rarity = item.rarity && item.rarity !== "unknown" ? item.rarity : "";
  const type = item.type && item.type !== "unknown" ? item.type : "";
  const size = item.size == null || item.size === "" ? "" : sizeKey(item.size);
  if (rarity) {
    if (treasure.rarity !== rarity) return false;
  } else if (categoryClosed(board, counts, "rarities", treasure.rarity)) return false;
  if (type) {
    if (!typeMatches(treasure.type, type)) return false;
  } else if (categoryClosed(board, counts, "types", treasure.type)) return false;
  const shape = treasureShape(treasure) || (treasure.size == null ? "" : sizeKey(treasure.size));
  if (size) {
    if (!treasureMatchesSize(treasure, size)) return false;
  } else if (shape && categoryClosed(board, counts, "sizes", shape)) return false;
  return true;
}

function categoryClosed(board, counts, kind, id) {
  if (!id || !board) return false;
  const key = kind === "sizes" ? sizeKey(id) : String(id);
  const max = board.maxCounts?.[kind]?.[key];
  if (!Number.isInteger(max)) return false;
  return (counts[kind]?.[key] || 0) >= max;
}

function unknownColorWorth(board, data, mins, remaining) {
  if (remaining <= 0) return 0;
  const counts = tally(board.items || [], data);
  const capped = [];
  const open = [];
  ((data && data.rarities) || []).forEach((entry) => {
    const id = entry.id;
    if (!id || id === "unknown" || mins[id] == null) return;
    const max = board.maxCounts?.rarities?.[id];
    if (!Number.isInteger(max)) {
      open.push({ id, min: mins[id] });
      return;
    }
    const room = max - (counts.rarities?.[id] || 0);
    if (room > 0) capped.push({ min: mins[id], room });
  });
  capped.sort((left, right) => left.min - right.min);
  let left = remaining;
  let worth = 0;
  capped.forEach((entry) => {
    if (left <= 0) return;
    const take = Math.min(entry.room, left);
    worth += entry.min * 3 * take;
    left -= take;
  });
  if (left > 0 && open.length) {
    worth += weightedColorMinimum(data, open) * 3 * left;
  }
  return worth;
}

function weightedColorMinimum(data, open) {
  const order = ((data && data.rarities) || []).map((entry) => entry.id).filter((id) => id && id !== "unknown");
  let total = 0;
  let weight = 0;
  open.forEach((entry) => {
    const index = order.indexOf(entry.id);
    const scale = index < 0 ? 1 : 2 ** (order.length - 1 - index);
    total += entry.min;
    weight += scale;
  });
  return weight ? total / weight : 0;
}

function rarityMinimums(data) {
  const mins = {};
  ((data && data.treasures) || []).forEach((treasure) => {
    const price = Number(treasure.price);
    if (!treasure.rarity || treasure.rarity === "unknown" || !Number.isFinite(price)) return;
    if (mins[treasure.rarity] == null || price < mins[treasure.rarity]) mins[treasure.rarity] = price;
  });
  return mins;
}

function unlistedSlots(board) {
  if (!board || !Number.isInteger(board.treasureTotal)) return 0;
  return Math.max(0, board.treasureTotal - (board.items || []).length);
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
    return item.size != null && sizeKey(item.size) === state.selected.id;
  });
}

function selectionLabel(selected) {
  if (selected.id === "unknown") return "Unknown";
  if (selected.kind === "rarities") return rarityName(selected.id);
  if (selected.kind === "types") return typeName(selected.id);
  return sizeLabel(selected.id);
}

function itemSummary(item) {
  const parts = [];
  if (item.rarity) parts.push(rarityName(item.rarity));
  if (item.type) parts.push(typeName(item.type));
  if (item.size != null) parts.push(sizeLabel(item.size, item.type));
  return parts.join(" · ") || "Unknown rarity";
}

function orderedSizePresets() {
  return ((state.data && state.data.sizePresets) || []).map(String).slice().sort((left, right) => {
    const [leftColumns, leftRows] = left.split("x").map(Number);
    const [rightColumns, rightRows] = right.split("x").map(Number);
    return leftColumns - rightColumns || leftRows - rightRows;
  });
}

function sizeCells(size) {
  if (size == null || size === "") return null;
  const shape = String(size).match(/^(\d+)x(\d+)$/i);
  if (shape) return Number(shape[1]) * Number(shape[2]);
  const tiles = Number(size);
  return Number.isInteger(tiles) && tiles > 0 ? tiles : null;
}

function sizeKey(size) {
  if (size == null || size === "") return "";
  const text = String(size);
  if (/^\d+x\d+$/i.test(text)) return text.toLowerCase();
  const cells = sizeCells(size);
  const presets = (state.data && state.data.sizePresets) || [];
  const matches = presets.filter((preset) => sizeCells(preset) === cells);
  if (cells === 15 && matches.some((preset) => String(preset) === "5x3")) return "5x3";
  return matches.length ? String(matches[0]) : text;
}

function sizeLabel(size, type) {
  if ((type === "collection" || type === "figurine") && sizeCells(size) === collectionTiles()) return collectionShape();
  return sizeKey(size);
}

function collectionTiles() {
  return 6;
}

function collectionShape() {
  return "2x3";
}

function lockCollectionGroup(group) {
  if (group.type !== "collection") return;
  group.size = collectionShape();
  if (group.open === "size") group.open = "";
}

function quantityLabel(count, max, kind) {
  if (Number.isInteger(max)) return `${count}/${max}`;
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
    const key = sizeKey(item.size);
    if (key && Object.prototype.hasOwnProperty.call(sizes, key)) sizes[key] += 1;
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
  return catalogWorthParts(board, data, pickMax, false).total;
}

function catalogWorthParts(board, data, pickMax, includeUnlisted) {
  const treasures = data.treasures || [];
  const slots = estimateSlots(board, includeUnlisted);
  const empty = { known: 0, unknown: 0, total: 0 };
  if (!slots.length || !treasures.length) return empty;
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
  const parts = { known: 0, unknown: 0 };
  ordered.forEach((entry) => {
    if (entry.slot.exactPrice != null) {
      const claimed = items.find((catalogItem) => {
        if (used.has(catalogItem.index)) return false;
        if (entry.slot.exactName) return catalogItem.name === entry.slot.exactName;
        return Number(catalogItem.price) === entry.slot.exactPrice && matchesFacts(catalogItem, entry.slot);
      });
      if (claimed) used.add(claimed.index);
      addWorth(parts, entry.slot, entry.slot.exactPrice);
      return;
    }
    const pool = slotPool(entry.slot);
    const taken = takeItem(pool, used, entry.slot, rooms) ||
      (pool === items ? null : takeItem(items, used, entry.slot, rooms));
    if (!taken) return;
    used.add(taken.item.index);
    spend(taken.item, taken.slot, rooms);
    addWorth(parts, entry.slot, taken.item.price);
  });
  parts.total = parts.known + parts.unknown;
  return parts;
}

function addWorth(parts, slot, price) {
  if (slot.unlisted) parts.unknown += price;
  else parts.known += price;
}

function estimateSlots(board, includeUnlisted) {
  const active = usesMaxConstraint(board) || includeUnlisted;
  const slots = [];
  (board.items || []).forEach((item) => {
    const exact = exactTreasure(item);
    if (exact || item.price != null) {
      slots.push({
        rarity: item.rarity && item.rarity !== "unknown" ? item.rarity : exact && exact.rarity || null,
        type: item.type || (exact && exact.type) || null,
        size: item.size == null ? (exact ? Number(exact.size) : null) : item.size,
        exactName: exact ? exact.name : null,
        exactPrice: item.price != null ? Number(item.price) : Number(exact.price)
      });
      return;
    }
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
    slots.push({ rarity: null, type: null, size: null, unlisted: true });
  }
  return slots;
}

function openRooms(board, data) {
  return {
    rarities: roomFor(board, data.rarities.map((entry) => entry.id).filter((id) => id !== "unknown"), "rarities", (item) => item.rarity || ""),
    types: roomFor(board, data.types.map((entry) => entry.id), "types", (item) => item.type || ""),
    sizes: roomFor(board, data.sizePresets.map(String), "sizes", (item) => item.size == null ? "" : sizeKey(item.size))
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
  if (slot.size == null && !catalogSizeRoomOpen(rooms, item)) return false;
  return true;
}

function matchesFacts(item, slot) {
  if (slot.rarity && item.rarity !== slot.rarity) return false;
  if (slot.type && !typeMatches(item.type, slot.type)) return false;
  if (slot.size != null && !treasureMatchesSize(item, slot.size)) return false;
  return true;
}

function matchingTreasures(item) {
  const treasures = state.data && state.data.treasures;
  if (!item || !Array.isArray(treasures) || !treasures.length) return [];
  if (item.price == null && !item.rarity && !item.type && item.size == null) return [];
  return treasures.filter((treasure) => {
    if (item.price != null && Number(treasure.price) !== Number(item.price)) return false;
    if (item.rarity && treasure.rarity !== item.rarity) return false;
    if (item.type && !typeMatches(treasure.type, item.type)) return false;
    if (item.size != null && !treasureMatchesSize(treasure, item.size)) return false;
    return true;
  }).sort((left, right) => left.name.localeCompare(right.name));
}

function exactTreasure(item) {
  const matches = matchingTreasures(item);
  if (item && item.catalogName) {
    const chosen = matches.find((treasure) => treasure.name === item.catalogName);
    if (chosen) return chosen;
  }
  return matches.length === 1 ? matches[0] : null;
}

function resolveExactItems() {
  if (!state.board) return false;
  let changed = false;
  state.board.items.forEach((item) => {
    const treasure = exactTreasure(item);
    if (!treasure) {
      if (item.catalogName) {
        delete item.catalogName;
        changed = true;
      }
      return;
    }
    if (fillWouldExceed(item, treasure)) return;
    if (item.catalogName !== treasure.name) {
      item.catalogName = treasure.name;
      changed = true;
    }
    if (!item.rarity && treasure.rarity) {
      item.rarity = treasure.rarity;
      changed = true;
    }
    if (!item.type && treasure.type) {
      item.type = treasure.type;
      changed = true;
    }
    if (item.size == null && (treasure.shape || treasure.size != null)) {
      item.size = treasureShape(treasure) || sizeKey(treasure.size);
      changed = true;
    }
    if (item.price == null && Number.isFinite(Number(treasure.price))) {
      item.price = Number(treasure.price);
      changed = true;
    }
  });
  return changed;
}

function renderKnown() {
  const current = $("#known-current");
  const menu = $("#known-menu");
  if (!current || !menu || !state.board) return;
  const items = state.board.items
    .map((item) => ({ item, treasure: exactTreasure(item) }))
    .filter((entry) => entry.treasure);
  current.textContent = items.length === 0 ? "None yet" : items.length === 1 ? "1 item" : `${items.length} items`;
  menu.replaceChildren();
  if (!items.length) {
    const empty = document.createElement("li");
    empty.className = "house-option";
    empty.textContent = "None yet";
    menu.appendChild(empty);
    return;
  }
  items.forEach(({ item, treasure }) => {
    const row = document.createElement("li");
    row.className = "house-option";
    row.setAttribute("role", "option");
    row.dataset.item = item.id;
    const rarity = state.data.rarities.find((entry) => entry.id === treasure.rarity);
    if (rarity) {
      row.classList.add("is-rarity");
      row.style.setProperty("--chip", rarity.color);
    }
    const name = document.createElement("span");
    name.className = "known-name";
    name.textContent = treasure.name;
    const price = document.createElement("span");
    price.className = "known-price";
    price.textContent = formatCoins(treasure.price);
    row.append(name, price, itemRemoveButton(item));
    menu.appendChild(row);
  });
}

function catalogSupports(facts) {
  const treasures = state.data && state.data.treasures;
  if (!Array.isArray(treasures) || !treasures.length) return true;
  return treasures.some((treasure) => {
    if (facts.rarity && treasure.rarity !== facts.rarity) return false;
    if (facts.type && !typeMatches(treasure.type, facts.type)) return false;
    if (facts.size != null && !treasureMatchesSize(treasure, facts.size)) return false;
    return true;
  });
}

function choiceFacts(base, kind, id) {
  const facts = {
    rarity: base.rarity || "",
    type: base.type || "",
    size: base.size == null || base.size === "" ? null : base.size
  };
  if (kind === "rarity") facts.rarity = id;
  else if (kind === "type") facts.type = id;
  else facts.size = id;
  return facts;
}

function typeMatches(itemType, slotType) {
  if (itemType === slotType) return true;
  const figurine = itemType === "figurine" || itemType === "collection";
  const asked = slotType === "figurine" || slotType === "collection";
  return figurine && asked;
}

function treasureShape(treasure) {
  const shape = treasure && treasure.shape;
  return shape && /^\d+x\d+$/i.test(String(shape)) ? String(shape).toLowerCase() : "";
}

function treasureMatchesSize(treasure, size) {
  if (size == null || size === "") return true;
  const wanted = /^\d+x\d+$/i.test(String(size)) ? String(size).toLowerCase() : "";
  const known = treasureShape(treasure);
  if (known) return wanted ? known === wanted : sizeCells(known) === sizeCells(size);
  return Number(treasure.size) === sizeCells(size);
}

function sizeShapesFor(cells) {
  return ((state.data && state.data.sizePresets) || []).map(String).filter((preset) => sizeCells(preset) === Number(cells));
}

function sizeRoomOpen(rooms, cells) {
  if (!rooms || !rooms.sizes) return true;
  const shapes = sizeShapesFor(cells);
  if (!shapes.length) return true;
  return shapes.some((shape) => rooms.sizes[shape] > 0);
}

function catalogSizeRoomOpen(rooms, treasure) {
  const shape = treasureShape(treasure);
  if (shape) return !rooms || !rooms.sizes || rooms.sizes[shape] > 0;
  return sizeRoomOpen(rooms, treasure.size);
}

function spendCatalogSize(rooms, treasure) {
  const shape = treasureShape(treasure);
  if (shape) {
    if (rooms && rooms.sizes && rooms.sizes[shape] !== Infinity && rooms.sizes[shape] > 0) rooms.sizes[shape] -= 1;
    return;
  }
  spendSizeRoom(rooms, treasure.size);
}

function spendSizeRoom(rooms, cells) {
  if (!rooms || !rooms.sizes) return;
  const shape = sizeShapesFor(cells).find((preset) => rooms.sizes[preset] !== Infinity && rooms.sizes[preset] > 0);
  if (shape) rooms.sizes[shape] -= 1;
}

function spend(item, slot, rooms) {
  if (!slot.rarity && rooms.rarities && rooms.rarities[item.rarity] !== Infinity) rooms.rarities[item.rarity] -= 1;
  if (!slot.type && rooms.types && rooms.types[item.type] !== Infinity) rooms.types[item.type] -= 1;
  if (slot.size == null) spendCatalogSize(rooms, item);
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
  const blank = { house: state.data.houses[0].id, hero: state.data.heroes[0].id, items: [], treasureTotal: null, maxCounts: emptyMaxCounts() };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!saved || typeof saved !== "object") return blank;
    const items = Array.isArray(saved.items) ? saved.items.filter(validItem) : [];
    items.forEach((item) => {
      if (item.type === "figurine") item.type = "collection";
    });
    const total = Number(saved.treasureTotal);
    return {
      house: typeof saved.house === "string" ? saved.house : blank.house,
      hero: typeof saved.hero === "string" ? saved.hero : blank.hero,
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
      if (!Number.isInteger(value) || value < 0) return;
      if (kind === "types" && (id === "figurine" || id === "collection")) {
        result.types.collection = (result.types.collection || 0) + value;
        return;
      }
      const key = kind === "sizes" ? sizeKey(id) : id;
      if (key) result[kind][key] = value;
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
  navigator.serviceWorker.register("./sw.js?v=163").catch(() => {});
}
