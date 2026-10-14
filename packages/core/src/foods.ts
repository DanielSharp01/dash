import type { Food, FoodItem, Recipe, StoredBatch } from "./schemas";

/** Every food lookup in core goes through one of these, so the caller decides where foods come from. */
export type FoodLookup = (id: string | undefined) => Food | undefined;

export function lookupOf(foods: Iterable<Food>): FoodLookup {
  const byId = new Map<string, Food>();
  for (const f of foods) byId.set(f.id, f);
  return (id) => (id ? byId.get(id) : undefined);
}

export const asItem = (f: Food | undefined): FoodItem | undefined => (f?.kind === "item" ? f : undefined);
export const asRecipe = (f: Food | undefined): Recipe | undefined => (f?.kind === "recipe" ? f : undefined);

export const isFinished = (b: Pick<StoredBatch, "yield">) => b.yield !== undefined;

const liveBatches = (r: Recipe) => r.batches.filter((b) => !b.deleted);

export const latestBatch = (r: Recipe) => [...liveBatches(r)].reverse().find(isFinished);

/**
 * The batch a portion comes from by default: one's newest not eaten up yet, else one's newest,
 * and only then a shared recipe's reference batch, whatever its date.
 */
export const currentBatch = (r: Recipe) => {
  const own = [...liveBatches(r)].reverse().filter((b) => !b.shared);
  return own.find((b) => isFinished(b) && !b.gone) ?? own.find(isFinished) ?? latestBatch(r);
};

/** The batch that was being eaten on a day: the newest finished one made on or before it. */
export const batchOn = (r: Recipe, date: string) =>
  [...liveBatches(r)].reverse().find((b) => isFinished(b) && b.madeOn <= date) ?? liveBatches(r).find(isFinished);

/** A recipe is only offered for logging once at least one cooking is finished. */
export const loggable = (f: Food) => f.kind !== "recipe" || !!latestBatch(f);

/** Items with the same name are variations of one thing. Case doesn't matter; accents do, since Eger and Éger are different words. */
export const groupKey = (name: string) => name.trim().toLocaleLowerCase();

export function displayName(f: Food) {
  return f.kind === "item" ? [f.name, f.variant, f.brand].filter(Boolean).join(" · ") : f.name;
}

/** Whether a food points at another, through combo parts or batch ingredients. */
export function usesFood(f: Food, id: string) {
  if (f.kind === "combo") return f.parts.some((p) => p.foodId === id);
  if (f.kind === "recipe") return f.batches.some((b) => !b.deleted && b.ingredients.some((p) => p.foodId === id));
  return false;
}
