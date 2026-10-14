import { namedAmount } from "./units";
import { nutrientKeys, type Amount, type FoodItemInput, type FoodUnit, type Label, type LabelOrigin, type Nutrients, type Serving, type UnitSystem } from "./schemas";

export { nutrientKeys };

/** What nutrition needs from an item. */
export type FoodData = Pick<FoodItemInput, "unit" | "labels" | "servings">;

/** What capture shows by default; the rest of the label is behind "more". */
export const mainNutrients = ["kcal", "protein", "carbs", "fat"] as const;

export const nutrientMeta: Record<(typeof nutrientKeys)[number], { label: string; unit: string; sub?: boolean }> = {
  kcal: { label: "Energy", unit: "kcal" },
  fat: { label: "Fat", unit: "g" },
  saturates: { label: "of which saturates", unit: "g", sub: true },
  carbs: { label: "Carbohydrate", unit: "g" },
  sugars: { label: "of which sugars", unit: "g", sub: true },
  protein: { label: "Protein", unit: "g" },
  salt: { label: "Salt", unit: "g" },
  caffeine: { label: "Caffeine", unit: "mg" },
};

const common: Record<string, { unit: FoodUnit; factor: number }> = {
  g: { unit: "g", factor: 1 },
  kg: { unit: "g", factor: 1000 },
  oz: { unit: "g", factor: 28.3495 },
  ml: { unit: "ml", factor: 1 },
  l: { unit: "ml", factor: 1000 },
  "fl oz": { unit: "ml", factor: 29.5735 },
  piece: { unit: "piece", factor: 1 },
};

/** The dimension a common unit measures, or undefined for a serving name like "bowl". */
export const unitDimension = (unit?: string): FoodUnit | undefined => (unit ? common[unit]?.unit : undefined);

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The label that applied on a day: the last version starting on or before it, else the oldest. */
export function labelAt(food: FoodData, date?: string): Label | undefined {
  const { labels } = food;
  if (!labels.length) return undefined;
  if (!date) return labels[labels.length - 1];
  return [...labels].reverse().find((l) => l.from <= date) ?? labels[0];
}

/** Values for one g, ml or piece. */
export function perUnit(label: Label, unit: FoodUnit): Nutrients | undefined {
  const divisor = label.per === "100" ? 100 : unit === "piece" ? (label.servingPieces?.count ?? 1) : label.servingSize;
  if (!divisor) return undefined;
  return Object.fromEntries(Object.entries(label.values).map(([k, v]) => [k, v / divisor]));
}

/**
 * The serving printed on the label counts as one, so "2 bars" works without adding it by hand,
 * and so does its piece: with "2 cookies, 80 g" a cookie is 40 g.
 */
export function servingsOf(food: FoodData): Serving[] {
  const l = labelAt(food);
  const printed: Serving[] = [];
  if (l?.per === "serving") {
    const pieces = l.servingPieces;
    const size = food.unit === "piece" ? (pieces?.count ?? 1) : l.servingSize;
    if (size) printed.push({ name: l.servingName?.trim() || "serving", size });
    if (pieces?.name.trim() && pieces.count > 0 && size) printed.push({ name: pieces.name.trim(), size: food.unit === "piece" ? 1 : size / pieces.count });
  }
  const unique = printed.filter((p, i) => printed.findIndex((x) => same(x.name, p.name)) === i);
  return [...unique, ...food.servings.filter((s) => !unique.some((p) => same(p.name, s.name)))];
}

/** The amount in the food's own unit, or undefined when it can't be converted. */
export function quantity(food: FoodData, amount: Amount): number | undefined {
  const { value, unit } = amount;
  if (value === undefined || !unit) return undefined;
  const c = common[unit];
  if (c?.unit === food.unit) return value * c.factor;
  // A serving can share a common unit's name: toast bread weighed in g with a "piece" of 40 g.
  const s = servingsOf(food).find((x) => same(x.name, unit));
  return s?.size !== undefined ? value * s.size : undefined;
}

/** What an amount of a food holds, by the label valid on the day; undefined when nothing is known. */
export function contents(food: FoodData, amount: Amount, date: string, base?: number): Nutrients | undefined {
  const label = labelAt(food, date);
  const qty = base ?? quantity(food, amount);
  const per = label && perUnit(label, food.unit);
  if (!per || qty === undefined) return undefined;
  return Object.fromEntries(Object.entries(per).map(([k, v]) => [k, v * qty]));
}

/** Servings first, since "1 mug" is how people think, then the units the food can convert. */
export function unitsFor(food: FoodData | undefined, system: UnitSystem): string[] {
  if (!food) return system === "metric" ? ["piece", "g", "ml"] : ["piece", "oz", "fl oz"];
  const servings = servingsOf(food).map((s) => s.name);
  const base = food.unit === "piece" ? ["piece"] : system === "metric" ? [food.unit] : [food.unit === "g" ? "oz" : "fl oz", food.unit];
  return [...servings, ...base];
}

/** A sensible first amount when there's no usual one: a serving, else a common size. */
export function defaultAmount(food: FoodData | undefined, system: UnitSystem): Amount {
  const serving = food && servingsOf(food)[0];
  if (serving) return { value: 1, unit: serving.name };
  if (!food || food.unit === "piece") return { value: 1, unit: "piece" };
  if (system === "imperial") return food.unit === "g" ? { value: 4, unit: "oz" } : { value: 8, unit: "fl oz" };
  return food.unit === "g" ? { value: 100, unit: "g" } : { value: 250, unit: "ml" };
}

export const round = (n: number, digits = 1) => Math.round(n * 10 ** digits) / 10 ** digits;

export function formatAmount(a: Amount) {
  if (a.value === undefined) return a.unit ? `? ${a.unit}` : "amount unknown";
  const v = a.value === 0.5 ? "½" : a.value === 1.5 ? "1½" : String(round(a.value, 2));
  const named = namedAmount(a);
  return a.unit ? `${v} ${a.unit}${named ? ` (${named})` : ""}` : v;
}

/** "per 100 g", "per bar (45 g)", "per piece". */
export function basisLabel(label: Pick<Label, "per" | "servingSize" | "servingName" | "servingPieces">, unit: FoodUnit) {
  if (label.per === "100") return `per 100 ${unit}`;
  const name = label.servingName?.trim() || (unit === "piece" && !label.servingPieces ? "piece" : "serving");
  const pieces = label.servingPieces?.name.trim() ? `${round(label.servingPieces.count)} ${label.servingPieces.name.trim()}` : undefined;
  const size = label.servingSize && unit !== "piece" ? `${round(label.servingSize)} ${unit}` : undefined;
  const detail = [pieces, size].filter(Boolean).join(", ");
  return detail ? `per ${name} (${detail})` : `per ${name}`;
}

export const originLabels: Record<LabelOrigin, string> = {
  "open-food-facts": "Open Food Facts",
  usda: "USDA",
  ciqual: "Ciqual",
  online: "Found online",
  estimate: "Estimate",
};

export type Provenance = Pick<Label, "verified" | "origin" | "originRev" | "url">;
export const offThePackage: Provenance = { verified: true };
export const estimated: Provenance = { verified: false, origin: "estimate" };

export function provenanceOf({ verified, origin, originRev, url }: Label): Provenance {
  return { verified, ...(origin ? { origin } : {}), ...(originRev ? { originRev } : {}), ...(url ? { url } : {}) };
}

/** "Label verified", then what filled it in; nothing more for values typed off the package. */
export function provenanceChips(label: Pick<Label, "verified" | "origin">): string[] {
  return [...(label.verified ? ["Label verified"] : []), ...(label.origin ? [originLabels[label.origin]] : [])];
}

export const sameValues = (a: Nutrients, b: Nutrients) => nutrientKeys.every((k) => a[k] === b[k]);

/**
 * The kcal the macros add up to (4 per g of protein and carbs, 9 per g of fat) when that's far
 * from the stated kcal, which usually means a typo. Fibre, rounding and alcohol cause small or
 * known gaps, so only a big one counts. Undefined while the label agrees or isn't filled in.
 */
export function energyMismatch(values: Nutrients): number | undefined {
  const { kcal, protein, carbs, fat } = values;
  if (kcal === undefined || protein === undefined || carbs === undefined || fat === undefined) return undefined;
  const fromMacros = 4 * protein + 4 * carbs + 9 * fat;
  return Math.abs(kcal - fromMacros) > Math.max(15, 0.15 * Math.max(kcal, fromMacros)) ? Math.round(fromMacros) : undefined;
}
