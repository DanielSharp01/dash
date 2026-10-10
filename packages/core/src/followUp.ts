import { asItem, usesFood, type FoodLookup } from "./foods";
import { lineContents } from "./nutrition";
import type { Entry, Food, FoodEntry } from "./schemas";

/** Whether any line of the entry points at the food. */
export const entryUses = (e: Entry, foodId: string): e is FoodEntry => e.kind === "food" && e.lines.some((l) => l.foodId === foodId);

/**
 * Follow-up is derived, not stored: completing an item clears every entry that uses it.
 * Lines of an unsure item are followed up through the item, so they don't count here.
 * An exercise entry needs follow-up when its burn is missing.
 */
export function entryNeedsFollowUp(e: Entry, foods: FoodLookup): boolean {
  if (e.kind === "exercise") return e.kcal === undefined;
  return e.lines.some((l) => !asItem(foods(l.foodId))?.unsure && !lineContents(l, e.when.date, foods)?.kcal?.complete);
}

/** Live unsure items that something still uses, most used first. Expects live entries only. */
export function unsureItemsInUse(foods: Food[], entries: Entry[]) {
  const live = foods.filter((f) => !f.deleted);
  return (
    live
      .filter((f) => f.kind === "item" && f.unsure)
      .map((item) => ({
        foodId: item.id,
        entryIds: entries.filter((e) => entryUses(e, item.id)).map((e) => e.id),
        usedByFoodIds: live.filter((f) => usesFood(f, item.id)).map((f) => f.id),
      }))
      // An item from an abandoned edit is used nowhere, so there's nothing to follow up.
      .filter((u) => u.entryIds.length > 0 || u.usedByFoodIds.length > 0)
      .sort((a, b) => b.entryIds.length - a.entryIds.length)
  );
}
