import { BEGINNING, type ActivityInput, type FoodItemInput, type LabelOrigin, type Nutrients, type Serving } from "@dash/core";

export type PublicFood = { key: string; starter: boolean; food: Omit<FoodItemInput, "id"> };
export type PublicActivity = { key: string; starter: boolean; activity: Omit<ActivityInput, "id"> };

const item = (name: string, icon: string, unit: "g" | "ml", values: Nutrients, servings: Serving[], variant?: string, origin: LabelOrigin = "usda"): Omit<FoodItemInput, "id"> => ({
  kind: "item",
  name,
  icon,
  iconAuto: false,
  catalogued: true,
  unit,
  ...(variant ? { variant } : {}),
  notFluid: false,
  unsure: false,
  labels: [{ from: BEGINNING, per: "100", values, verified: false, origin }],
  servings,
});

/**
 * Each item lists every label version with its start: fixing a wrong value means editing that
 * label here, which changes past days too; a changed product gets a new label with a later
 * start. Drinks use common reference values for brewed drinks, not zeros, so they count as known.
 * Onion and chicken are USDA raw values; the cream is a typical Hungarian 20% főzőtejszín label.
 */
export const publicFoods: PublicFood[] = [
  { key: "water", starter: true, food: item("Water", "💧", "ml", { kcal: 0, fat: 0, carbs: 0, protein: 0, caffeine: 0 }, [{ name: "glass", size: 250 }]) },
  { key: "coffee", starter: true, food: item("Coffee", "☕", "ml", { kcal: 1, fat: 0, carbs: 0, protein: 0, caffeine: 40 }, [{ name: "mug", size: 250 }]) },
  { key: "tea", starter: true, food: item("Tea", "🍵", "ml", { kcal: 1, fat: 0, carbs: 0, protein: 0, caffeine: 20 }, [{ name: "mug", size: 250 }]) },
  {
    key: "onion",
    starter: false,
    food: item("Onion", "🧅", "g", { kcal: 40, fat: 0.1, saturates: 0.04, carbs: 9.3, sugars: 4.2, protein: 1.1, salt: 0.01 }, [{ name: "onion", size: 110 }], "raw"),
  },
  {
    key: "chicken-breast",
    starter: false,
    food: item("Chicken breast", "🍗", "g", { kcal: 120, fat: 2.6, saturates: 0.6, carbs: 0, sugars: 0, protein: 22.5, salt: 0.11 }, [], "raw, skinless"),
  },
  {
    key: "cooking-cream",
    starter: false,
    food: item("Cooking cream", "🥛", "g", { kcal: 200, fat: 20, saturates: 13, carbs: 3.7, sugars: 3.7, protein: 2.7, salt: 0.1 }, [], "20%", "estimate"),
  },
];

/** Only activities whose factor has been checked against its source are public. */
export const publicActivities: PublicActivity[] = [
  { key: "walk", starter: true, activity: { name: "Walk", icon: "🚶", iconAuto: false, measures: ["distance", "duration"], burn: { basis: "distance", kcalPerKgKm: 0.5 } } },
  { key: "run", starter: true, activity: { name: "Run", icon: "🏃", iconAuto: false, measures: ["distance", "duration"], burn: { basis: "distance", kcalPerKgKm: 1 } } },
  { key: "cycle", starter: true, activity: { name: "Cycling", icon: "🚴", iconAuto: false, measures: ["distance", "duration"], burn: { basis: "distance", kcalPerKgKm: 0.3 } } },
];
