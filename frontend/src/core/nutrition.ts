import { foodById, itemById, recipeById } from "./foods";
import { contents, nutrientKeys, quantity, unitDimension } from "./label";
import type { Amount, Batch, Entry, FoodData, FoodEntry, Line, NutrientKey, Portion } from "./types";

/** Records what an item amount comes to now, in the item's own unit; recipe amounts are already g or portions. */
export function withBase<T extends Line | Portion>(x: T, food: FoodData | undefined): T {
  if (!food) return x;
  const base = quantity(food, x.amount);
  return { ...x, base };
}

/**
 * A summed value is complete only when every part had it. An incomplete one is a floor:
 * the day shows "≥" or "≤" instead of passing it off as the whole.
 */
export interface Value {
  value: number;
  complete: boolean;
}

export type Contents = Partial<Record<NutrientKey, Value>>;

function add(into: Contents, part: Contents | undefined) {
  for (const k of nutrientKeys) {
    const p = part?.[k];
    const sum = into[k];
    if (!p) {
      if (sum) sum.complete = false;
      else into[k] = { value: 0, complete: false };
      continue;
    }
    if (sum) into[k] = { value: sum.value + p.value, complete: sum.complete && p.complete };
    else into[k] = { ...p };
  }
  return into;
}

const known = (n: Partial<Record<NutrientKey, number>> | undefined): Contents | undefined =>
  n && Object.fromEntries(Object.entries(n).map(([k, v]) => [k, { value: v, complete: true }]));

/** A recipe's batch sized per g or per portion, from its ingredients' labels on the day it was made. */
export function batchPerUnit(batch: Batch): { unit: "g" | "portion"; per: Contents } | undefined {
  const y = batch.yield;
  if (!y) return undefined;
  const total = batchTotal(batch);
  const divisor = "grams" in y ? y.grams : y.portions;
  if (!divisor) return undefined;
  const per = Object.fromEntries(Object.entries(total).map(([k, v]) => [k, { value: v.value / divisor, complete: v.complete }]));
  return { unit: "grams" in y ? "g" : "portion", per };
}

export function batchTotal(batch: Pick<Batch, "ingredients" | "madeOn">): Contents {
  if (!batch.ingredients.length) return {};
  return batch.ingredients.reduce<Contents>((sum, p) => add(sum, portionContents(p, batch.madeOn)), {});
}

function recipeContents(recipeId: string | undefined, batchId: string | undefined, amount: Amount): Contents | undefined {
  const batch = recipeById(recipeId)?.batches.find((b) => b.id === batchId);
  const sized = batch && batchPerUnit(batch);
  if (!sized || amount.value === undefined) return undefined;
  const qty = amount.unit === sized.unit ? amount.value : sized.unit === "g" ? quantity({ unit: "g", labels: [], servings: [] }, amount) : undefined;
  if (qty === undefined) return undefined;
  return Object.fromEntries(Object.entries(sized.per).map(([k, v]) => [k, { value: v.value * qty, complete: v.complete }]));
}

export function portionContents(p: Portion, date: string): Contents | undefined {
  const food = foodById(p.foodId);
  if (food?.kind === "item") return known(contents(food, p.amount, date, p.base));
  if (food?.kind === "recipe") {
    const batch = [...food.batches].reverse().find((b) => b.yield && b.madeOn <= date) ?? food.batches.find((b) => b.yield);
    return recipeContents(food.id, batch?.id, p.amount);
  }
  return undefined;
}

/** What nutrition sees of a line: its item, or the label it carries. */
export const lineFood = (line: Line): FoodData | undefined => line.own ?? itemById(line.itemId);

export function lineContents(line: Line, date: string): Contents | undefined {
  if (line.recipeId) return recipeContents(line.recipeId, line.batchId, line.amount);
  const food = lineFood(line);
  return food && known(contents(food, line.amount, date, line.base));
}

export const entryContents = (e: FoodEntry): Contents => e.lines.reduce<Contents>((sum, l) => add(sum, lineContents(l, e.when.date)), {});

/** Whether a line is identified: a known item or recipe, not an unsure item or bare name. */
export const lineIdentified = (l: Line) => !!l.recipeId || (!!l.itemId && !itemById(l.itemId)?.unsure);

/**
 * A known ml item counts unless marked otherwise. Anything not identified yet counts when
 * it was logged as a drink and its amount is a volume.
 */
export function lineFluidMl(line: Line, via: FoodEntry["via"]): number | undefined | null {
  const item = itemById(line.itemId);
  if (lineIdentified(line)) {
    if (!item || item.unit !== "ml" || item.notFluid) return null;
    return line.base ?? quantity(item, line.amount);
  }
  if (via !== "drank") return null;
  const food = lineFood(line);
  if (food && food.unit === "ml") return line.base ?? quantity(food, line.amount);
  return unitDimension(line.amount.unit) === "ml" ? quantity({ unit: "ml", labels: [], servings: [] }, line.amount) : undefined;
}

export interface Part {
  value: number;
  /** Lines with no value, or only part of one. */
  missing: number;
}

export interface DayTotals {
  kcal: Part;
  protein: Part;
  carbs: Part;
  fat: Part;
  fluid: Part;
  burned: number;
}

export function dayTotals(entries: Entry[]): DayTotals {
  const part = (): Part => ({ value: 0, missing: 0 });
  const t: DayTotals = { kcal: part(), protein: part(), carbs: part(), fat: part(), fluid: part(), burned: 0 };
  for (const e of entries) {
    if (e.kind === "exercise") {
      t.burned += e.kcal ?? 0;
      continue;
    }
    for (const line of e.lines) {
      const c = lineContents(line, e.when.date);
      for (const k of ["kcal", "protein", "carbs", "fat"] as const) {
        const v = c?.[k];
        if (v) t[k].value += v.value;
        if (!v?.complete) t[k].missing += 1;
      }
      const ml = lineFluidMl(line, e.via);
      if (ml === undefined) t.fluid.missing += 1;
      else if (ml !== null) t.fluid.value += ml;
    }
  }
  return t;
}
