import type { Item, Nutrition, NutritionVersion } from "./types";

/**
 * The version in effect on a day, so a reformulated product doesn't rewrite older entries.
 * Days before the first version use it anyway: it's the earliest thing known.
 */
export function nutritionAt(item: Pick<Item, "nutrition"> | undefined, date?: string): NutritionVersion | undefined {
  const versions = item?.nutrition;
  if (!versions?.length) return undefined;
  if (date === undefined) return versions[versions.length - 1];
  return [...versions].reverse().find((v) => v.from <= date) ?? versions[0];
}

/** The bare values, for forms that don't deal with the version date. */
export function valuesOf(v?: NutritionVersion): Partial<Nutrition> {
  if (!v) return {};
  const { from: _, ...values } = v;
  return values;
}

export const latestNutrition = (item?: Pick<Item, "nutrition">) => nutritionAt(item);

export function versionLabel(from: string) {
  if (!from) return "Original";
  return `Since ${new Date(`${from}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`;
}
