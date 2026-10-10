import { asItem, batchOn, currentBatch, type FoodLookup } from "./foods";
import { contents, nutrientKeys, quantity, unitDimension, type FoodData } from "./label";
import type { Amount, Batch, Combo, DayTotals, Entry, FoodEntry, Line, NutrientKey, Nutrients, Part, Portion, Recipe } from "./schemas";

/** Records what an item amount comes to now, in the item's own unit; recipe amounts are already g or portions. */
export function withBase<T extends Line | Portion>(x: T, food: FoodData | undefined): T {
  if (!food) return x;
  const { base: _, ...rest } = x;
  const base = quantity(food, x.amount);
  return (base === undefined ? rest : { ...rest, base }) as T;
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

const known = (n: Nutrients | undefined): Contents | undefined =>
  n && Object.fromEntries(Object.entries(n).map(([k, v]) => [k, { value: v, complete: true }]));

const grams: FoodData = { unit: "g", labels: [], servings: [] };
const millilitres: FoodData = { unit: "ml", labels: [], servings: [] };

/** A recipe's batch sized per g or per portion, from its ingredients' labels on the day it was made. */
export function batchPerUnit(batch: Batch, foods: FoodLookup): { unit: "g" | "portion"; per: Contents } | undefined {
  const y = batch.yield;
  if (!y) return undefined;
  const total = batchTotal(batch, foods);
  const divisor = "grams" in y ? y.grams : y.portions;
  if (!divisor) return undefined;
  const per = Object.fromEntries(Object.entries(total).map(([k, v]) => [k, { value: v.value / divisor, complete: v.complete }]));
  return { unit: "grams" in y ? "g" : "portion", per };
}

export function batchTotal(batch: Pick<Batch, "ingredients" | "madeOn">, foods: FoodLookup): Contents {
  if (!batch.ingredients.length) return {};
  return batch.ingredients.reduce<Contents>((sum, p) => add(sum, portionContents(p, batch.madeOn, foods)), {});
}

function recipeContents(recipe: Recipe, batchId: string | undefined, amount: Amount, foods: FoodLookup): Contents | undefined {
  const batch = recipe.batches.find((b) => b.id === batchId);
  const sized = batch && batchPerUnit(batch, foods);
  if (!sized || amount.value === undefined) return undefined;
  const qty = amount.unit === sized.unit ? amount.value : sized.unit === "g" ? quantity(grams, amount) : undefined;
  if (qty === undefined) return undefined;
  return Object.fromEntries(Object.entries(sized.per).map(([k, v]) => [k, { value: v.value * qty, complete: v.complete }]));
}

export function portionContents(p: Portion, date: string, foods: FoodLookup): Contents | undefined {
  const food = foods(p.foodId);
  if (food?.kind === "item") return known(contents(food, p.amount, date, p.base));
  if (food?.kind === "recipe") return recipeContents(food, batchOn(food, date)?.id, p.amount, foods);
  return undefined;
}

export function lineContents(line: Line, date: string, foods: FoodLookup): Contents | undefined {
  const food = foods(line.foodId);
  if (food?.kind === "recipe") return recipeContents(food, line.batchId, line.amount, foods);
  if (food?.kind === "item") return known(contents(food, line.amount, date, line.base));
  return undefined;
}

export const entryContents = (e: FoodEntry, foods: FoodLookup): Contents =>
  e.lines.reduce<Contents>((sum, l) => add(sum, lineContents(l, e.when.date, foods)), {});

/**
 * Whether a line is identified: a recipe, or a catalogued item that isn't unsure. An entry-only
 * label or a bare name is not, so it only counts as fluid when logged as a drink.
 */
export function lineIdentified(l: Line, foods: FoodLookup) {
  const food = foods(l.foodId);
  return food?.kind === "recipe" || (food?.kind === "item" && food.catalogued && !food.unsure);
}

/**
 * A known ml item counts unless marked otherwise. Anything not identified yet counts when
 * it was logged as a drink and its amount is a volume. null means it isn't fluid at all.
 */
export function lineFluidMl(line: Line, via: FoodEntry["via"], foods: FoodLookup): number | undefined | null {
  const item = asItem(foods(line.foodId));
  if (lineIdentified(line, foods)) {
    if (!item || item.unit !== "ml" || item.notFluid) return null;
    return line.base ?? quantity(item, line.amount);
  }
  if (via !== "drank") return null;
  if (item && item.unit === "ml") return line.base ?? quantity(item, line.amount);
  return unitDimension(line.amount.unit) === "ml" ? quantity(millilitres, line.amount) : undefined;
}

export function dayTotals(entries: Entry[], foods: FoodLookup): DayTotals {
  const part = (): Part => ({ value: 0, missing: 0 });
  const t: DayTotals = { kcal: part(), protein: part(), carbs: part(), fat: part(), fluid: part(), burned: 0 };
  for (const e of entries) {
    if (e.kind === "exercise") {
      t.burned += e.kcal ?? 0;
      continue;
    }
    for (const line of e.lines) {
      const c = lineContents(line, e.when.date, foods);
      for (const k of ["kcal", "protein", "carbs", "fat"] as const) {
        const v = c?.[k];
        if (v) t[k].value += v.value;
        if (!v?.complete) t[k].missing += 1;
      }
      const ml = lineFluidMl(line, e.via, foods);
      if (ml === undefined) t.fluid.missing += 1;
      else if (ml !== null) t.fluid.value += ml;
    }
  }
  return t;
}

/** The combo's parts as entry lines, times how many were had: "2 mugs" logs every part twice. */
export function comboAsLines(combo: Pick<Combo, "parts">, times: number, foods: FoodLookup, newId: () => string): Line[] {
  return combo.parts.flatMap((p): Line[] => {
    const f = foods(p.foodId);
    if (!f || f.kind === "combo") return [];
    const amount: Amount = { ...p.amount };
    if (p.amount.value !== undefined) amount.value = p.amount.value * times;
    if (f.kind === "recipe") {
      const batchId = currentBatch(f)?.id;
      return [{ id: newId(), foodId: f.id, ...(batchId ? { batchId } : {}), amount }];
    }
    return [withBase({ id: newId(), foodId: f.id, amount }, f)];
  });
}
