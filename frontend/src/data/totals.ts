import { itemById } from "./catalogue";
import { nutritionAt } from "./nutrition";
import { baseQuantity, calculatedKcal } from "./store";
import type { Entry, FoodEntry } from "./types";

export type MacroKey = "protein" | "carbs" | "fat";

/** Calculated and estimated stay apart, and a missing value is counted, never added as zero. */
export interface Part {
  calculated: number;
  estimated: number;
  missing: number;
}

export interface DayTotals {
  kcal: Part;
  burned: number;
  macros: Record<MacroKey, Part>;
  /** Fluid items only; entries whose amount can't be converted are counted, not guessed. */
  fluid: { ml: number; unknown: number };
}

const emptyPart = (): Part => ({ calculated: 0, estimated: 0, missing: 0 });

function calculatedMacro(e: FoodEntry, key: MacroKey): number | undefined {
  const item = itemById(e.itemId);
  const base = baseQuantity(e);
  const per = nutritionAt(item, e.when.date)?.[key];
  if (!item || base === undefined || per === undefined) return undefined;
  return item.baseUnit === "piece" ? per * base : (per * base) / 100;
}

export function dayTotals(entries: Entry[]): DayTotals {
  const totals: DayTotals = { kcal: emptyPart(), burned: 0, macros: { protein: emptyPart(), carbs: emptyPart(), fat: emptyPart() }, fluid: { ml: 0, unknown: 0 } };
  for (const e of entries) {
    if (e.kind === "exercise") {
      totals.burned += e.kcalEstimate ?? 0;
      continue;
    }
    const item = itemById(e.itemId);
    if (item?.fluid && item.baseUnit === "ml") {
      const ml = baseQuantity(e);
      if (ml === undefined) totals.fluid.unknown += 1;
      else totals.fluid.ml += ml;
    }

    const kcal = calculatedKcal(e);
    if (kcal !== undefined) totals.kcal.calculated += kcal;
    else if (e.estimate?.kcal !== undefined) totals.kcal.estimated += e.estimate.kcal;
    else totals.kcal.missing += 1;

    for (const key of ["protein", "carbs", "fat"] as const) {
      const part = totals.macros[key];
      const value = calculatedMacro(e, key);
      if (value !== undefined) part.calculated += value;
      else if (e.estimate?.[key] !== undefined) part.estimated += e.estimate[key]!;
      else part.missing += 1;
    }
  }
  return totals;
}
