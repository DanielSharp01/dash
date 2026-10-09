import type { Item, Measure, Nutrition, NutritionVersion } from "./types";

/** How much of the item's base unit one of `label` is, following chained measures. */
export function measureInBase(item: Pick<Item, "baseUnit" | "measures">, label: string, seen: string[] = []): number | undefined {
  if (label === item.baseUnit) return 1;
  if (label === "L" && item.baseUnit === "ml") return 1000;
  if (label === "oz") return item.baseUnit === "g" ? 28.3495 : item.baseUnit === "ml" ? scaled(28.3495, measureInBase(item, "g", [...seen, label])) : undefined;
  if (label === "fl oz" && item.baseUnit === "ml") return 29.5735;
  if (seen.includes(label)) return undefined;
  const m = item.measures.find((x) => x.label === label);
  if (!m) return undefined;
  const inner = measureInBase(item, m.unit, [...seen, label]);
  return inner === undefined ? undefined : m.qty * inner;
}

const scaled = (f: number, n?: number) => (n === undefined ? undefined : f * n);

type LegacyMeasure = { label: string; base: number };

/** Items saved before measures could chain (`{ label, base }`), before brand folded into variant, and before nutrition had versions. */
export function normalizeItem({
  brand,
  nutrition,
  ...raw
}: Omit<Item, "measures" | "nutrition"> & { brand?: string; measures: (Measure | LegacyMeasure)[]; nutrition?: Nutrition | NutritionVersion[] }): Item {
  return {
    ...raw,
    nutrition: nutrition === undefined || Array.isArray(nutrition) ? nutrition : [{ from: "", ...nutrition }],
    variant: raw.variant ?? brand,
    measures: raw.measures.map((m): Measure => ("base" in m ? { label: m.label, qty: m.base, unit: raw.baseUnit } : m)),
  };
}
