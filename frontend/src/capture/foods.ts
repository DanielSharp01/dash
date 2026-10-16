import { useMemo } from "react";
import { autoFoodIcon, BEGINNING, currentBatch, groupKey, isFinished, type Amount, type Batch, type Food, type FoodInput, type FoodItem, type FoodLookup, type FoodUsage, labelAt, type Recipe } from "@dash/core";
import { asNewFood, useFoods } from "../queries/foods.queries";

/** What lists, search and cards offer: live, catalogued foods. One's own version and the shared one are both offered. */
export function listed(foods: Food[]): Food[] {
  return foods.filter((f) => !f.deleted && f.catalogued);
}

export function useListedFoods() {
  const foods = useFoods();
  return useMemo(() => listed(foods), [foods]);
}

const liveBatches = (r: Recipe) => r.batches.filter((b) => !b.deleted);

/** Cooked and not eaten up yet, newest first; these lead the I ate cards. A shared batch is nobody's leftovers. */
export const leftovers = (list: Food[]) =>
  list
    .filter((f): f is Recipe => f.kind === "recipe" && liveBatches(f).some((b) => isFinished(b) && !b.gone && !b.shared))
    .sort((a, b) => (currentBatch(b)?.madeOn ?? "").localeCompare(currentBatch(a)?.madeOn ?? ""));

export const cookingNow = (list: Food[]) => list.filter((f): f is Recipe => f.kind === "recipe" && liveBatches(f).some((b) => !isFinished(b)));

export const unfinishedBatch = (r: Recipe) => [...liveBatches(r)].reverse().find((b) => !isFinished(b));

export const finishedBatches = (r: Recipe) => liveBatches(r).filter(isFinished);

export const batchLabel = (b: Pick<Batch, "madeOn">) => new Date(`${b.madeOn}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });

/** Items sharing a name are variants of one another. */
export const variantsOf = (list: Food[], item: Pick<FoodItem, "id" | "name">) =>
  list.filter((f): f is FoodItem => f.kind === "item" && f.id !== item.id && !f.unsure && groupKey(f.name) === groupKey(item.name));

/** New entries can't refer to a deleted food, so a combo holding one can't be logged until it's restored or left out. */
export function deletedFoods(ids: (string | undefined)[], foods: FoodLookup): Food[] {
  const found = ids.map((id) => foods(id)).filter((f): f is Food => !!f?.deleted);
  return [...new Map(found.map((f) => [f.id, f])).values()];
}

const isFluidItem = (f: Food | undefined) => f?.kind === "item" && f.unit === "ml" && !f.notFluid;

export function isDrink(f: Food, foods: FoodLookup) {
  if (f.kind === "item") return isFluidItem(f);
  return f.kind === "combo" && f.parts.some((p) => isFluidItem(foods(p.foodId)));
}

const byLastLogged = (a: FoodUsage, b: FoodUsage) => (b.lastLoggedAt ?? "").localeCompare(a.lastLoggedAt ?? "");

/**
 * Most recently logged first. Usage has no per-verb date, so "ate" leaves out what was only drunk
 * lately, and "drank" what was only eaten.
 */
export function recentFoodIds(usage: Map<string, FoodUsage>, via?: "ate" | "drank") {
  const fits = (u: FoodUsage) => !via || (via === "ate" ? u.ate30d > 0 || u.drank30d === 0 : u.drank30d > 0 || u.ate30d === 0);
  return [...usage.values()].filter((u) => u.lastLoggedAt && fits(u)).sort(byLastLogged).map((u) => u.foodId);
}

/** Most often drunk in the last 30 days first, so a daily coffee stays ahead of last week's juice. */
export const frequentDrinkIds = (usage: Map<string, FoodUsage>) =>
  [...usage.values()].filter((u) => u.drank30d > 0).sort((a, b) => b.drank30d - a.drank30d || byLastLogged(a, b)).map((u) => u.foodId);

export const usualAmount = (usage: Map<string, FoodUsage>, foodId: string): Amount | undefined => usage.get(foodId)?.usualAmount;

export const usesOf = (usage: Map<string, FoodUsage>, foodId: string) => usage.get(foodId)?.uses ?? 0;

/** A blank item to fill in; nothing is stored until it's saved. */
export const blankItem = (name: string, extra: Partial<FoodItem> = {}): FoodItem => ({
  ...(asNewFood({
    id: crypto.randomUUID(),
    kind: "item",
    name,
    icon: autoFoodIcon(name, "item"),
    iconAuto: true,
    catalogued: true,
    unit: "g",
    notFluid: false,
    unsure: false,
    labels: [],
    servings: [],
  }) as FoodItem),
  ...extra,
});

/** Another flavour or size of the item: its details carry over, its barcode and label history don't. */
export function duplicateItem(item: FoodItem): FoodItem {
  const latest = labelAt(item);
  return blankItem(item.name, {
    ...(item.variant ? { variant: item.variant } : {}),
    ...(item.brand ? { brand: item.brand } : {}),
    icon: item.icon,
    iconAuto: item.iconAuto,
    unit: item.unit,
    notFluid: item.notFluid,
    labels: latest ? [{ ...latest, from: BEGINNING }] : [],
    servings: item.servings,
  });
}

/** Editing a public item makes the person's own copy; the public one then drops out of their lists. */
export const ownCopy = <T extends { id: string; originId?: string }>(input: T, stored: { id: string; public: boolean } | undefined): T =>
  stored?.public ? { ...input, id: crypto.randomUUID(), originId: stored.id } : input;

/** The writable part of a stored food, for saving it again with a change. */
export function foodInput(f: Food): FoodInput {
  const { revision: _, deleted: __, public: ___, starter: ____, ...rest } = f;
  if (rest.kind !== "recipe") return rest;
  const { batches: _____, ...recipe } = rest;
  return recipe;
}
