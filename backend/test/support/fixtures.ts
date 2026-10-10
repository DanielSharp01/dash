import { BEGINNING, type ComboInput, type FoodItemInput, type RecipeInput } from "@dash/core";
import { uuid } from "../support/helpers";

export function item(overrides: Partial<FoodItemInput> = {}): FoodItemInput {
  return {
    id: uuid(),
    kind: "item",
    name: "Oat milk",
    icon: "🥛",
    iconAuto: true,
    catalogued: true,
    unit: "ml",
    notFluid: false,
    unsure: false,
    labels: [{ from: BEGINNING, per: "100", values: { kcal: 50, protein: 1, carbs: 7, fat: 1.5 }, source: "package" }],
    servings: [{ name: "glass", size: 200 }],
    ...overrides,
  };
}

export const unsureItem = (name = "Mystery stew", overrides: Partial<FoodItemInput> = {}) =>
  item({ name, unit: "g", unsure: true, labels: [], servings: [], ...overrides });

export const recipe = (overrides: Partial<RecipeInput> = {}): RecipeInput => ({
  id: uuid(),
  kind: "recipe",
  name: "Chili",
  icon: "🌶️",
  iconAuto: true,
  catalogued: true,
  ...overrides,
});

export const combo = (parts: ComboInput["parts"], overrides: Partial<ComboInput> = {}): ComboInput => ({
  id: uuid(),
  kind: "combo",
  name: "Breakfast",
  icon: "🍱",
  iconAuto: true,
  catalogued: true,
  parts,
  ...overrides,
});

export const foodEntry = (lines: { foodId?: string; amount: { value?: number; unit?: string }; base?: number; batchId?: string; rawName?: string }[], date = "2026-09-10", extra: Record<string, unknown> = {}) => ({
  id: uuid(),
  kind: "food" as const,
  when: { date, kind: "exact" as const, time: "08:30" },
  via: "ate" as const,
  lines: lines.map((l) => ({ id: uuid(), ...l })),
  ...extra,
});
