import { createStore } from "./createStore";
import { suggestIcon } from "./icons";
import { BEGINNING, type Batch, type Combo, type Food, type Item, type Recipe } from "./types";

const drink = (id: string, name: string, icon: string, kcal: number, caffeine: number, serving: string): Item => ({
  id,
  kind: "item",
  name,
  icon,
  unit: "ml",
  labels: [{ from: BEGINNING, per: "100", values: { kcal, fat: 0, carbs: 0, protein: 0, caffeine }, source: "reference" }],
  servings: [{ name: serving, size: 250 }],
});

const food = (id: string, name: string, variant: string, icon: string, values: Item["labels"][number]["values"], servings: Item["servings"] = []): Item => ({
  id,
  kind: "item",
  name,
  variant,
  icon,
  unit: "g",
  labels: [{ from: BEGINNING, per: "100", values, source: "reference" }],
  servings,
});

/**
 * Starter items until the server provides a catalogue. Drinks use common reference values for
 * brewed drinks; onion and chicken are USDA raw values; the cream is a typical Hungarian 20%
 * főzőtejszín label, worth correcting from the actual package.
 */
const seeds: Food[] = [
  drink("seed-water", "Water", "💧", 0, 0, "glass"),
  drink("seed-coffee", "Coffee", "☕", 1, 40, "mug"),
  drink("seed-tea", "Tea", "🍵", 1, 20, "mug"),
  food("seed-onion", "Onion", "raw", "🧅", { kcal: 40, fat: 0.1, saturates: 0.04, carbs: 9.3, sugars: 4.2, protein: 1.1, salt: 0.01 }, [{ name: "onion", size: 110 }]),
  food("seed-chicken-breast", "Chicken breast", "raw, skinless", "🍗", { kcal: 120, fat: 2.6, saturates: 0.6, carbs: 0, sugars: 0, protein: 22.5, salt: 0.11 }),
  food("seed-cooking-cream", "Cooking cream", "20%", "🥛", { kcal: 200, fat: 20, saturates: 13, carbs: 3.7, sugars: 3.7, protein: 2.7, salt: 0.1 }),
];

const store = createStore<Food[]>("dash.foods.v1", seeds);
const applied = createStore<string[]>("dash.seedsApplied.v1", []);

// Starters added after someone's first run are added once; one they deleted stays deleted.
{
  const missing = seeds.filter((s) => !applied.get().includes(s.id) && !store.get().some((f) => f.id === s.id));
  if (missing.length) store.set([...store.get(), ...missing]);
  applied.set(seeds.map((s) => s.id));
}

export const useFoods = store.use;
export const foodsSnapshot = store.get;
export const restoreFoods = store.set;

/** Includes deleted ones, which past entries still need to show and calculate. */
export const foodById = (id?: string) => (id ? store.get().find((f) => f.id === id) : undefined);

export const itemById = (id?: string) => {
  const f = foodById(id);
  return f?.kind === "item" ? f : undefined;
};

export const recipeById = (id?: string) => {
  const f = foodById(id);
  return f?.kind === "recipe" ? f : undefined;
};

export const comboById = (id?: string) => {
  const f = foodById(id);
  return f?.kind === "combo" ? f : undefined;
};

export const allFoods = () => store.get().filter((f) => !f.deleted);

export const itemByBarcode = (code: string) => allFoods().find((f): f is Item => f.kind === "item" && f.barcode === code);

/** Adds the food, or replaces the stored one with the same id. */
export function saveFood(food: Food) {
  const all = store.get();
  store.set(all.some((f) => f.id === food.id) ? all.map((f) => (f.id === food.id ? food : f)) : [...all, food]);
}

export const removeFood = (id: string) => store.set(store.get().filter((f) => f.id !== id));

export const isFinished = (b: Batch) => b.yield !== undefined;

export const latestBatch = (r: Recipe) => [...r.batches].reverse().find(isFinished);

/** The batch a portion comes from by default: the newest one not eaten up yet. */
export const currentBatch = (r: Recipe) => [...r.batches].reverse().find((b) => isFinished(b) && !b.gone) ?? latestBatch(r);

/** Cooked and not eaten up yet, newest first; these lead the I ate cards. */
export const leftovers = () =>
  allFoods()
    .filter((f): f is Recipe => f.kind === "recipe" && f.batches.some((b) => isFinished(b) && !b.gone))
    .sort((a, b) => (currentBatch(b)?.madeOn ?? "").localeCompare(currentBatch(a)?.madeOn ?? ""));

export function setBatchGone(recipeId: string, batchId: string, gone: boolean) {
  const r = recipeById(recipeId);
  if (r) saveFood({ ...r, batches: r.batches.map((b) => (b.id === batchId ? { ...b, gone: gone || undefined } : b)) });
}

export const cookingNow = () => allFoods().filter((f): f is Recipe => f.kind === "recipe" && f.batches.some((b) => !isFinished(b)));

/** A recipe is only offered for logging once at least one cooking is finished. */
export const loggable = (f: Food) => f.kind !== "recipe" || !!latestBatch(f);

export function displayName(f: Food) {
  return f.kind === "item" && f.variant ? `${f.name} · ${f.variant}` : f.name;
}

/** A chosen icon, else the one the name suggests, so "Auto" in the editor is what every list shows. */
export function foodIcon(f: Food) {
  if (f.icon) return f.icon;
  const suggested = suggestIcon(f.name, f.kind === "recipe" ? ["food"] : ["drink", "food"]);
  if (suggested) return suggested;
  if (f.kind === "recipe") return "🍲";
  if (f.kind === "combo") return "🍱";
  return f.unit === "ml" ? "🥤" : "🍽️";
}

export const batchLabel = (b: Batch) =>
  new Date(`${b.madeOn}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });

/** Items sharing a name are variants of one another. */
export const variantsOf = (item: Pick<Item, "id" | "name">) =>
  allFoods().filter((f): f is Item => f.kind === "item" && f.id !== item.id && !f.unsure && f.name.trim().toLowerCase() === item.name.trim().toLowerCase());

export const combos = () => allFoods().filter((f): f is Combo => f.kind === "combo");
