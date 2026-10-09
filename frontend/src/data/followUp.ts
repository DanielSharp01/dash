import { itemById } from "./catalogue";
import { calculatedKcal, replaceEntries, storedEntries } from "./store";
import type { Entry, FoodEntry, Item } from "./types";
import { removeUserItem, saveUserItem, userItems } from "./userItems";

/** A calorie-only entry is a deliberate "~2k calories, don't ask": no item, nothing to follow up. */
export const isCalorieOnly = (e: Entry): boolean => e.kind === "food" && !e.itemId;

export const isProvisional = (e: Entry) => e.kind === "food" && !!itemById(e.itemId)?.provisional;

/**
 * Follow-up is derived, not stored: completing an item clears every entry that uses it.
 * Entries of a provisional item are followed up through the item, so they aren't listed here.
 */
export function entryNeedsFollowUp(e: Entry): boolean {
  if (e.kind === "exercise") return !e.activityId;
  if (isProvisional(e)) return false;
  return calculatedKcal(e) === undefined && e.estimate?.kcal === undefined;
}

export function provisionalItems(entries: Entry[]) {
  return userItems()
    .filter((i) => i.provisional)
    .map((item) => ({ item, entries: entries.filter((e): e is FoodEntry => e.kind === "food" && e.itemId === item.id) }))
    // One opened from an abandoned capture has nothing logged against it yet, so there's nothing to follow up.
    .filter((p) => p.entries.length > 0)
    .sort((a, b) => b.entries.length - a.entries.length);
}

export const followUpCount = (entries: Entry[]) => provisionalItems(entries).length + entries.filter(entryNeedsFollowUp).length;

/** A typed name (or unknown barcode) becomes an unsure item, reused when the same thing is logged again. */
export function ensureProvisionalItem(name: string, barcode?: string): Item {
  const key = name.trim().toLowerCase();
  const existing = userItems().find((i) => i.provisional && ((barcode && i.barcode === barcode) || i.name.trim().toLowerCase() === key));
  if (existing) {
    if (barcode && !existing.barcode) saveUserItem({ ...existing, barcode });
    return existing;
  }
  const item: Item = { id: crypto.randomUUID(), name: name.trim(), type: "item", baseUnit: "piece", measures: [], barcode, provisional: true };
  saveUserItem(item);
  return item;
}

/** The unsure item was something already known: its entries move over and it goes away; returns an undo. */
export function mergeInto(item: Item, target: Item): () => void {
  const before = storedEntries();
  const targetBefore = userItems().find((i) => i.id === target.id);
  replaceEntries(before.map((e) => (e.kind === "food" && e.itemId === item.id ? { ...e, itemId: target.id } : e)));
  // A scanned barcode is the one useful thing the unsure item knew that the target may not.
  if (item.barcode && !target.barcode) saveUserItem({ ...target, barcode: item.barcode });
  removeUserItem(item.id);
  return () => {
    saveUserItem(item);
    if (targetBefore) saveUserItem(targetBefore);
    else if (item.barcode && !target.barcode) removeUserItem(target.id);
    replaceEntries(before);
  };
}

/** Its entries keep their guess as calorie-only entries named after it; returns an undo. */
export function makeOneOff(item: Item): () => void {
  const before = storedEntries();
  replaceEntries(
    before.map((e) =>
      e.kind === "food" && e.itemId === item.id ? { ...e, itemId: undefined, note: e.note ?? item.name, amount: {} } : e,
    ),
  );
  removeUserItem(item.id);
  return () => {
    saveUserItem(item);
    replaceEntries(before);
  };
}

/**
 * Entries still point at a used item, so it's only hidden from lists and search; an unused one
 * is removed outright. Returns an undo.
 */
export function deleteItem(item: Item): () => void {
  const used = storedEntries().some((e) => e.kind === "food" && e.itemId === item.id);
  if (used) saveUserItem({ ...item, deleted: true });
  else removeUserItem(item.id);
  return () => saveUserItem(item);
}
