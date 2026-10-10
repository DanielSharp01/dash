import { BEGINNING, type Nutrients, type OpenFoodFactsResult, type Serving } from "@dash/core";
import { env } from "../config/env";

const fields: [keyof Nutrients, string][] = [
  ["kcal", "energy-kcal_100g"],
  ["fat", "fat_100g"],
  ["saturates", "saturated-fat_100g"],
  ["carbs", "carbohydrates_100g"],
  ["sugars", "sugars_100g"],
  ["protein", "proteins_100g"],
  ["salt", "salt_100g"],
];

interface Product {
  product_name?: string;
  brands?: string;
  quantity?: string;
  product_quantity?: number | string;
  serving_quantity?: number | string;
  nutriments?: Record<string, number | string | undefined>;
}

/**
 * Its "_100g" values are per 100 ml for drinks, so the unit comes from the pack size text.
 * Open Food Facts asks every client to identify itself with a User-Agent.
 */
async function lookup(code: string): Promise<OpenFoodFactsResult | undefined> {
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`, {
    headers: { "user-agent": env.OFF_USER_AGENT },
    signal: AbortSignal.timeout(5000),
  });
  if (res.status === 404) return undefined;
  if (!res.ok) throw new Error(`Open Food Facts answered ${res.status}`);
  const body = (await res.json()) as { status?: number; product?: Product };
  const p = body.product;
  if (!body.status || !p?.product_name?.trim()) return undefined;

  const unit = /\d\s*(ml|cl|dl|l)\b/i.test(p.quantity ?? "") ? "ml" : "g";
  const values: Nutrients = {};
  for (const [key, field] of fields) {
    const n = Number(p.nutriments?.[field]);
    if (p.nutriments?.[field] !== undefined && Number.isFinite(n) && n >= 0) values[key] = n;
  }
  const servings: Serving[] = [];
  const serving = Number(p.serving_quantity);
  if (serving > 0) servings.push({ name: "serving", size: serving });
  const pack = Number(p.product_quantity);
  if (pack > 0) servings.push({ name: "pack", size: pack });
  const brand = p.brands?.split(",")[0]?.trim();

  return {
    name: p.product_name.trim(),
    ...(brand ? { brand } : {}),
    unit,
    ...(values.kcal !== undefined ? { label: { from: BEGINNING, per: "100", values, source: "database" } as const } : {}),
    servings,
  };
}

export const openFoodFacts = { lookup };
