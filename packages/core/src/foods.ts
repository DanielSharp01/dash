import type { Food, FoodItem, Recipe, StoredBatch } from "./schemas";
import { daysBetween } from "./time";

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

export type CookingState = { kind: "cooking"; batch: StoredBatch } | { kind: "finished-today"; batch: StoredBatch } | { kind: "fresh" };

/**
 * What picking a recipe to cook meets. A batch still cooking is the one to continue; one of one's
 * own finished today and not eaten up more likely needs fixing than cooking again, so it's offered
 * alongside. Once marked eaten up it's done with, and fixing it goes through the recipe's batches.
 */
export function cookingState(r: Recipe, today: string): CookingState {
  const own = [...liveBatches(r)].reverse().filter((b) => !b.shared);
  const cooking = own.find((b) => !isFinished(b));
  if (cooking) return { kind: "cooking", batch: cooking };
  const finishedToday = own.find((b) => isFinished(b) && b.madeOn === today && !b.gone);
  return finishedToday ? { kind: "finished-today", batch: finishedToday } : { kind: "fresh" };
}

/** Still cooking this many days after it was started, a batch is probably forgotten, so Today asks about it. */
export const COOKING_ASK_AFTER_DAYS = 3;

export const cookingTooLong = (b: Pick<StoredBatch, "madeOn" | "yield">, today: string) => !isFinished(b) && daysBetween(b.madeOn, today) >= COOKING_ASK_AFTER_DAYS;

/** A recipe is only offered for logging once at least one cooking is finished. */
export const loggable = (f: Food) => f.kind !== "recipe" || !!latestBatch(f);

/** Items with the same name are variations of one thing. Case doesn't matter; accents do, since Eger and Éger are different words. */
export const groupKey = (name: string) => name.trim().toLocaleLowerCase();

const looseKey = (text?: string) => (text ?? "").trim().toLocaleLowerCase();

/** The same item twice: name, variant and brand all match, case aside. */
export const sameItem = (a: Pick<FoodItem, "name" | "variant" | "brand">, b: Pick<FoodItem, "name" | "variant" | "brand">) =>
  groupKey(a.name) === groupKey(b.name) && looseKey(a.variant) === looseKey(b.variant) && looseKey(a.brand) === looseKey(b.brand);

export function displayName(f: Food) {
  return f.kind === "item" ? [f.name, f.variant, f.brand].filter(Boolean).join(" · ") : f.name;
}

/** Whether a food points at another, through combo parts or batch ingredients. */
export function usesFood(f: Food, id: string) {
  if (f.kind === "combo") return f.parts.some((p) => p.foodId === id);
  if (f.kind === "recipe") return f.batches.some((b) => !b.deleted && b.ingredients.some((p) => p.foodId === id));
  return false;
}

const accented = "áàâäãåéèêëíìîïóòôöõőúùûüűçñ";
const unaccented = "aaaaaaeeeeiiiioooooouuuuucn";
export const foldAccents = { accented, unaccented };

/** Lower-case without accents, for search: "fustli" finds Füstli. Grouping by name stays accent-sensitive. */
export const foldText = (text: string) => [...text.toLowerCase()].map((c) => unaccented[accented.indexOf(c)] ?? c).join("");

/** The search's words, folded; each must appear somewhere, in any order. */
export const searchWords = (query: string) => foldText(query).split(/\s+/).filter(Boolean);

/** "potato raw" finds Potato · flesh, raw: every word of the query appears in the text, accents and case aside. */
export function matchesQuery(text: string, query: string) {
  const folded = foldText(text);
  return searchWords(query).every((w) => folded.includes(w));
}
