import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Nutrients, Serving } from "@dash/core";
import { readCsv } from "./csv";

/** A food as a reference table has it, per 100 g, before it becomes a shared item. */
export interface ReferenceFood {
  ref: string;
  name: string;
  variant?: string;
  values: Nutrients;
  servings: Serving[];
}

/** Foundation Foods give energy by Atwater factors, SR Legacy as plain kcal; the first one present wins. */
const energyIds = ["1008", "2048", "2047"];
const gramNutrients: Record<string, keyof Nutrients> = { "1003": "protein", "1004": "fat", "1005": "carbs", "2000": "sugars", "1258": "saturates" };
const SODIUM_MG = "1093";
const CAFFEINE_MG = "1057";
const MAX_SERVINGS = 6;

const round = (n: number) => Math.round(n * 100) / 100;

/** SR Legacy files some foods under a category first; the food itself is the next part. */
const droppedCategories = new Set(["beverages", "spices", "snacks", "candies"]);
/** Categories that tell the food apart, so they stay, at the end of the variation. */
const keptCategories = new Set(["babyfood", "fast foods", "restaurant"]);

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * "Rice, white, long-grain, raw" is Rice, in the variation "white, long-grain, raw";
 * "Beverages, coffee, brewed" is Coffee, brewed; "Babyfood, juice, apple" is Juice, apple, babyfood.
 */
export function splitDescription(description: string): { name: string; variant?: string } {
  const cleaned = description.replace(/\s*\(Includes foods for USDA's Food Distribution Program\)/i, "");
  let parts = cleaned.split(/[,;]/).map((p) => p.trim()).filter(Boolean);
  const category = parts[0]!.toLowerCase();
  if (parts.length > 1 && droppedCategories.has(category)) parts = parts.slice(1);
  else if (parts.length > 1 && keptCategories.has(category)) parts = [...parts.slice(1), category];
  const [first, ...rest] = parts;
  const variant = rest.join(", ");
  return { name: capitalise(first!), ...(variant ? { variant } : {}) };
}

export const referenceKey = (f: Pick<ReferenceFood, "name" | "variant">) => `${f.name} ${f.variant ?? ""}`.trim().toLowerCase();

async function readTable(dir: string, keep?: Set<string>): Promise<ReferenceFood[]> {
  const descriptions = new Map<string, string>();
  for await (const r of readCsv(join(dir, "food.csv"))) if (!keep || keep.has(r.fdc_id!)) descriptions.set(r.fdc_id!, r.description!);

  const amounts = new Map<string, Map<string, number>>();
  for await (const r of readCsv(join(dir, "food_nutrient.csv"))) {
    if (!descriptions.has(r.fdc_id!) || r.amount === "") continue;
    const amount = Number(r.amount);
    if (!Number.isFinite(amount) || amount < 0) continue;
    const of = amounts.get(r.fdc_id!) ?? new Map<string, number>();
    of.set(r.nutrient_id!, amount);
    amounts.set(r.fdc_id!, of);
  }

  const units = new Map<string, string>();
  if (existsSync(join(dir, "measure_unit.csv"))) for await (const r of readCsv(join(dir, "measure_unit.csv"))) units.set(r.id!, r.name!);
  const portions = new Map<string, Serving[]>();
  for await (const r of readCsv(join(dir, "food_portion.csv"))) {
    if (!descriptions.has(r.fdc_id!)) continue;
    const grams = Number(r.gram_weight);
    const count = Number(r.amount) || 1;
    const unit = units.get(r.measure_unit_id!);
    const name = (r.portion_description || [unit && unit !== "undetermined" ? unit : "", r.modifier].filter(Boolean).join(" ")).trim().slice(0, 200);
    if (!name || !(grams > 0)) continue;
    const list = portions.get(r.fdc_id!) ?? [];
    if (list.length < MAX_SERVINGS && !list.some((s) => s.name.toLowerCase() === name.toLowerCase())) list.push({ name, size: round(grams / count) });
    portions.set(r.fdc_id!, list);
  }

  const foods: ReferenceFood[] = [];
  for (const [ref, description] of descriptions) {
    const of = amounts.get(ref);
    const kcal = energyIds.map((id) => of?.get(id)).find((v) => v !== undefined);
    // A row without energy is a lab sample or an incomplete record, of no use for logging.
    if (!of || kcal === undefined) continue;
    const values: Nutrients = { kcal: Math.round(kcal) };
    for (const [id, key] of Object.entries(gramNutrients)) if (of.has(id)) values[key] = round(of.get(id)!);
    if (of.has(SODIUM_MG)) values.salt = round((of.get(SODIUM_MG)! * 2.5) / 1000);
    if (of.has(CAFFEINE_MG)) values.caffeine = round(of.get(CAFFEINE_MG)!);
    foods.push({ ref, ...splitDescription(description), values, servings: portions.get(ref) ?? [] });
  }
  return foods;
}

/**
 * Reads unzipped FoodData Central CSV folders: Foundation Foods (only the foods listed in
 * foundation_food.csv; the rest are lab samples) and SR Legacy. Where both have a food, the newer
 * Foundation data wins.
 */
export async function readUsda(dirs: string[]): Promise<ReferenceFood[]> {
  const foundationDir = dirs.find((d) => existsSync(join(d, "foundation_food.csv")));
  const legacyDir = dirs.find((d) => existsSync(join(d, "sr_legacy_food.csv")));
  if (!foundationDir && !legacyDir) throw new Error("No Foundation Foods or SR Legacy folder among the arguments");
  const listed = new Set<string>();
  if (foundationDir) for await (const r of readCsv(join(foundationDir, "foundation_food.csv"))) listed.add(r.fdc_id!);
  const foundation = foundationDir ? await readTable(foundationDir, listed) : [];
  const legacy = legacyDir ? await readTable(legacyDir) : [];
  const seen = new Set(foundation.map(referenceKey));
  return [...foundation, ...legacy.filter((f) => !seen.has(referenceKey(f)))];
}
