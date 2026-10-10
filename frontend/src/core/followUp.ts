import { entriesSnapshot, entriesUsing, restoreEntries } from "./entries";
import { currentBatch, foodById, foodsSnapshot, itemById, restoreFoods, saveFood } from "./foods";
import { lineContents, withBase } from "./nutrition";
import type { Combo, Entry, Food, FoodEntry, Item, Line, Recipe } from "./types";

/**
 * Follow-up is derived, not stored: completing an item clears every entry that uses it.
 * Lines of an unsure item are followed up through the item, so they don't count here.
 */
export function entryNeedsFollowUp(e: Entry): boolean {
  if (e.kind === "exercise") return !e.activityId;
  return e.lines.some((l) => !itemById(l.itemId)?.unsure && !lineContents(l, e.when.date)?.kcal?.complete);
}

export function unsureItemsInUse(entries: Entry[]) {
  return foodsSnapshot()
    .filter((f): f is Item => f.kind === "item" && !!f.unsure && !f.deleted)
    .map((item) => ({ item, entries: entriesUsing(entries, item.id), inFoods: foodsSnapshot().filter((f) => !f.deleted && usesFood(f, item.id)) }))
    // An item from an abandoned edit is used nowhere, so there's nothing to follow up.
    .filter((u) => u.entries.length > 0 || u.inFoods.length > 0)
    .sort((a, b) => b.entries.length - a.entries.length);
}

export const followUpCount = (entries: Entry[]) => unsureItemsInUse(entries).length + entries.filter(entryNeedsFollowUp).length;

/** Both stores at once, so one undo puts every change back. */
function snapshot() {
  const entries = entriesSnapshot();
  const foods = foodsSnapshot();
  return () => {
    restoreFoods(foods);
    restoreEntries(entries);
  };
}

const mapLines = (fn: (e: FoodEntry) => FoodEntry) => restoreEntries(entriesSnapshot().map((e) => (e.kind === "food" ? fn(e) : e)));

/**
 * The unsure item was something already known: an item, a recipe or a combo. Its lines move
 * over and it goes away. Returns an undo.
 */
export function mergeInto(item: Item, target: Food): () => void {
  const undo = snapshot();
  if (target.kind === "combo") {
    restoreFoods(foodsSnapshot().filter((f) => f.id !== item.id));
    mapLines((e) => {
      if (!e.lines.some((l) => l.itemId === item.id)) return e;
      const lines = e.lines.flatMap((l) => (l.itemId === item.id ? comboAsLines(target, l.amount.value ?? 1) : [l]));
      return e.lines.length === 1 ? { ...e, lines, comboId: target.id, title: target.name } : { ...e, lines };
    });
    return undo;
  }
  mapLines((e) => ({ ...e, lines: e.lines.map((l) => (l.itemId === item.id ? moveLine(l, item, target) : l)) }));
  // A scanned barcode is the one useful thing the unsure item knew that the target may not.
  if (target.kind === "item" && item.barcode && !target.barcode) saveFood({ ...target, barcode: item.barcode });
  restoreFoods(foodsSnapshot().filter((f) => f.id !== item.id));
  return undo;
}

/** A line of the unsure item, now pointing at what it really was; "1 bowl" of a recipe in portions becomes 1 portion. */
function moveLine(l: Line, item: Item, target: Item | Recipe): Line {
  const rawName = l.rawName ?? item.name;
  if (target.kind === "item") return withBase({ ...l, itemId: target.id, rawName, base: undefined }, target);
  const batch = currentBatch(target);
  const inPortions = batch?.yield && "portions" in batch.yield;
  const unit = l.amount.unit === "g" || l.amount.unit === "portion" ? l.amount.unit : inPortions ? "portion" : l.amount.unit;
  return { id: l.id, recipeId: target.id, batchId: batch?.id, rawName, amount: { ...l.amount, unit } };
}

/** The combo's parts as entry lines, times how many were had: "2 mugs" logs every part twice. */
export function comboAsLines(combo: Combo, times = 1): Line[] {
  return combo.parts.flatMap((p): Line[] => {
    const f = foodById(p.foodId);
    if (!f || f.kind === "combo") return [];
    const amount = { ...p.amount, value: p.amount.value === undefined ? undefined : p.amount.value * times };
    if (f.kind === "recipe") return [{ id: crypto.randomUUID(), recipeId: f.id, batchId: currentBatch(f)?.id, amount }];
    return [withBase({ id: crypto.randomUUID(), itemId: f.id, amount }, f)];
  });
}

/**
 * The unsure item was things had together: each entry gets the combo's parts in its place,
 * scaled by the amount logged, and the unsure item goes away. Returns an undo.
 */
export function completeAsCombo(item: Item, combo: Combo): () => void {
  const undo = snapshot();
  saveFood(combo);
  mapLines((e) => {
    if (!e.lines.some((l) => l.itemId === item.id)) return e;
    const lines = e.lines.flatMap((l) => (l.itemId === item.id ? comboAsLines(combo, l.amount.value ?? 1) : [l]));
    return e.lines.length === 1 ? { ...e, lines, comboId: combo.id, title: combo.name } : { ...e, lines };
  });
  restoreFoods(foodsSnapshot().filter((f) => f.id !== item.id));
  return undo;
}

/** Its lines keep what it knew as their own label, and it leaves the catalogue. Returns an undo. */
export function makeEntryOnly(item: Item): () => void {
  const undo = snapshot();
  const own = { unit: item.unit, labels: item.labels, servings: item.servings };
  mapLines((e) => ({ ...e, lines: e.lines.map((l) => (l.itemId === item.id ? { ...l, itemId: undefined, rawName: l.rawName ?? item.name, own } : l)) }));
  restoreFoods(foodsSnapshot().filter((f) => f.id !== item.id));
  return undo;
}

/** Past entries still point at a used food, so it's only hidden; an unused one is removed. Returns an undo. */
export function deleteFood(food: Food): () => void {
  const undo = snapshot();
  const used = entriesUsing(entriesSnapshot(), food.id).length > 0 || foodsSnapshot().some((f) => (f.kind === "combo" || f.kind === "recipe") && usesFood(f, food.id));
  if (used) saveFood({ ...food, deleted: true });
  else restoreFoods(foodsSnapshot().filter((f) => f.id !== food.id));
  return undo;
}

function usesFood(f: Food, id: string) {
  if (f.kind === "combo") return f.parts.some((p) => p.foodId === id);
  if (f.kind === "recipe") return f.batches.some((b) => b.ingredients.some((p) => p.foodId === id));
  return false;
}

export { snapshot as undoPoint };
