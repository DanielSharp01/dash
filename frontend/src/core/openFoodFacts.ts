import { BEGINNING, type Label, type Nutrients, type Serving } from "./types";

export interface Found {
  name: string;
  brand?: string;
  unit: "g" | "ml";
  label?: Label;
  servings: Serving[];
}

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
 * Open Food Facts by barcode. Its "_100g" values are per 100 ml for drinks, so the unit comes
 * from the pack size text. Any failure means "not found": a lookup must never block capture.
 */
export async function lookupBarcode(code: string, signal?: AbortSignal): Promise<Found | undefined> {
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`, { signal });
    if (!res.ok) return undefined;
    const body = (await res.json()) as { status?: number; product?: Product };
    const p = body.product;
    if (!body.status || !p?.product_name) return undefined;

    const unit = /\d\s*(ml|cl|dl|l)\b/i.test(p.quantity ?? "") ? "ml" : "g";
    const values: Nutrients = {};
    for (const [key, field] of fields) {
      const n = Number(p.nutriments?.[field]);
      if (p.nutriments?.[field] !== undefined && Number.isFinite(n)) values[key] = n;
    }
    const servings: Serving[] = [];
    const serving = Number(p.serving_quantity);
    if (serving > 0) servings.push({ name: "serving", size: serving });
    const pack = Number(p.product_quantity);
    if (pack > 0) servings.push({ name: "pack", size: pack });

    return {
      name: p.product_name.trim(),
      brand: p.brands?.split(",")[0]?.trim() || undefined,
      unit,
      label: values.kcal !== undefined ? { from: BEGINNING, per: "100", values, source: "database" } : undefined,
      servings,
    };
  } catch {
    return undefined;
  }
}
