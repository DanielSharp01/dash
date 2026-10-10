import type { FoodEntry } from "./schemas";

/** The food a food entry was logged as: its combo, or its single item or recipe. */
export function loggedFoodId(e: Pick<FoodEntry, "comboId" | "lines">) {
  if (e.comboId) return e.comboId;
  return e.lines.length === 1 ? e.lines[0]!.foodId : undefined;
}
