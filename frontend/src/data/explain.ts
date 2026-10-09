import { itemById } from "./catalogue";
import { nutritionAt } from "./nutrition";
import { baseQuantity } from "./store";
import type { FoodEntry } from "./types";
import type { MacroKey } from "./totals";

const round = (n: number) => (Math.abs(n) < 10 ? Math.round(n * 10) / 10 : Math.round(n));

/** The amount in the item's base unit when the logged unit differs, e.g. "350 g" for "1 bowl". */
export function baseAmountLabel(entry: FoodEntry): string | undefined {
  const item = itemById(entry.itemId);
  const base = baseQuantity(entry);
  if (!item || base === undefined || entry.amount.unit === item.baseUnit) return undefined;
  return `${round(base)} ${item.baseUnit}`;
}

/** Grams of each macro, calculated from the item or taken from the user's guess; undefined when unknown. */
export function entryMacros(entry: FoodEntry): Partial<Record<MacroKey, number>> | undefined {
  const item = itemById(entry.itemId);
  const base = baseQuantity(entry);
  const n = nutritionAt(item, entry.when.date);
  if (item && n && base !== undefined) {
    // Scaled from the amount, not from calories, which can be zero (water).
    const f = item.baseUnit === "piece" ? base : base / 100;
    return {
      protein: n.protein === undefined ? undefined : round(n.protein * f),
      carbs: n.carbs === undefined ? undefined : round(n.carbs * f),
      fat: n.fat === undefined ? undefined : round(n.fat * f),
    };
  }
  const e = entry.estimate;
  if (e && (e.protein !== undefined || e.carbs !== undefined || e.fat !== undefined)) {
    return { protein: e.protein, carbs: e.carbs, fat: e.fat };
  }
  return undefined;
}
