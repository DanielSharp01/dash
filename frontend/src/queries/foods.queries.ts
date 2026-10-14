import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { lookupOf, type Batch, type Food, type FoodInput, type FoodItemInput, type StoredBatch, type UpdateFoodResponse } from "@dash/core";
import * as foodsApi from "../api/foods.api";
import { queryClient as qc } from "./client";
import { cachedFood, entriesChanged, mergeRows, putFoods } from "./cache";
import { keys } from "./keys";
import { optimistic, run } from "./run";

export const foodsQuery = queryOptions({
  queryKey: keys.foods,
  queryFn: () => foodsApi.getFoods().then((r) => r.foods),
  refetchOnWindowFocus: "always",
});

export const foodUsageQuery = queryOptions({
  queryKey: keys.foodUsage,
  queryFn: () => foodsApi.getFoodUsage().then((r) => r.usage),
});

/** Every food the person can see, deleted and uncatalogued ones included, since past entries point at them. */
export const useFoods = () => useSuspenseQuery(foodsQuery).data;

/** Built once per catalogue version, so screens that didn't change keep their lookups. */
export function useFoodLookup() {
  const foods = useFoods();
  return useMemo(() => lookupOf(foods), [foods]);
}

export function useFoodUsage() {
  const usage = useSuspenseQuery(foodUsageQuery).data;
  return useMemo(() => new Map(usage.map((u) => [u.foodId, u])), [usage]);
}

/** Revision 0 marks a row that is on screen but not stored yet. */
export function asNewFood(input: FoodInput): Food {
  const stored = { revision: 0, deleted: false, public: false, starter: false };
  return input.kind === "recipe" ? { ...input, ...stored, batches: [] } : { ...input, ...stored };
}

const setFood = (id: string) => (row: Food | undefined) =>
  qc.setQueryData<Food[]>(keys.foods, (old) => (row ? mergeRows(old, [row]) : old?.filter((f) => f.id !== id)));

/** Shows foods that a save creates along the way, and takes them out again if it fails. */
function showNewFoods(inputs: FoodInput[]) {
  const shown = inputs.filter((f) => !cachedFood(qc, f.id)).map(asNewFood);
  putFoods(qc, shown);
  return () => qc.setQueryData<Food[]>(keys.foods, (old) => old?.filter((f) => !shown.some((s) => s.id === f.id && f.revision === 0)));
}

export function saveFood(input: FoodInput, newFoods: FoodInput[] = []): Promise<{ food: Food; undoToken?: string }> {
  const existing = cachedFood(qc, input.id);
  const next = (existing ? { ...existing, ...input } : asNewFood(input)) as Food;
  const hideNew = showNewFoods(newFoods);
  return optimistic({
    scope: `food:${input.id}`,
    get: () => cachedFood(qc, input.id),
    set: setFood(input.id),
    next,
    send: () => {
      const revision = cachedFood(qc, input.id)?.revision ?? 0;
      const body = { ...input, ...(newFoods.length ? { newFoods } : {}) };
      return revision === 0 ? foodsApi.postFood(body) : foodsApi.putFood({ ...body, revision });
    },
    stored: (d) => d.food,
    onSuccess: (d) => putFoods(qc, d.newFoods),
    onError: hideNew,
  }).then((d) => ({ food: d.food, undoToken: "undoToken" in d ? (d as UpdateFoodResponse).undoToken : undefined }));
}

/** "Just for me" on a public item; the server works out which fields differ from it. */
export async function saveOwnValues(input: FoodItemInput): Promise<{ food: Food; undoToken?: string }> {
  const before = cachedFood(qc, input.id);
  if (before) setFood(input.id)({ ...before, ...input } as Food);
  try {
    const { food } = await foodsApi.putOwnValues(input);
    setFood(input.id)(food);
    return { food };
  } catch (error) {
    if (before) setFood(input.id)(before);
    throw error;
  }
}

/** Soft: past entries keep pointing at it. */
export function deleteFood(id: string) {
  let before: Food | undefined;
  return run({
    scope: { id: `food:${id}` },
    onMutate: () => {
      before = cachedFood(qc, id);
      if (before) setFood(id)({ ...before, deleted: true });
    },
    mutationFn: () => foodsApi.deleteFood(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.foods, exact: true });
      entriesChanged(qc);
    },
    onError: () => before && setFood(id)(before),
  });
}

export function restoreFood(id: string) {
  return run({
    scope: { id: `food:${id}` },
    mutationFn: () => foodsApi.restoreFood(id),
    onSuccess: (food) => {
      putFoods(qc, [food]);
      entriesChanged(qc);
    },
  });
}

const cachedBatch = (recipeId: string, batchId: string) => {
  const r = cachedFood(qc, recipeId);
  return r?.kind === "recipe" ? r.batches.find((b) => b.id === batchId) : undefined;
};

const setBatch = (recipeId: string, batchId: string) => (row: StoredBatch | undefined) =>
  qc.setQueryData<Food[]>(keys.foods, (old) =>
    old?.map((f) => {
      if (f.id !== recipeId || f.kind !== "recipe") return f;
      const batches = row ? (mergeRows(f.batches, [row]) ?? []) : f.batches.filter((b) => b.id !== batchId);
      return { ...f, batches };
    }),
  );

/** Creates the batch the first time; the recipe has to exist, or be queued ahead in its scope. */
export function saveBatch(recipeId: string, batch: Batch, newFoods: FoodInput[] = []) {
  const existing = cachedBatch(recipeId, batch.id);
  const hideNew = showNewFoods(newFoods);
  return optimistic({
    scope: `food:${recipeId}`,
    get: () => cachedBatch(recipeId, batch.id),
    set: setBatch(recipeId, batch.id),
    next: { ...batch, revision: existing?.revision ?? 0, deleted: false },
    send: () => foodsApi.putBatch(recipeId, { ...batch, revision: cachedBatch(recipeId, batch.id)?.revision ?? 0, ...(newFoods.length ? { newFoods } : {}) }),
    stored: (d) => d.batch,
    onSuccess: (d) => putFoods(qc, d.newFoods),
    onError: hideNew,
  }).then((d) => d.batch);
}

export function deleteBatch(recipeId: string, batchId: string) {
  let before: StoredBatch | undefined;
  return run({
    scope: { id: `food:${recipeId}` },
    onMutate: () => {
      before = cachedBatch(recipeId, batchId);
      if (before) setBatch(recipeId, batchId)({ ...before, deleted: true });
    },
    mutationFn: () => foodsApi.deleteBatch(recipeId, batchId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.foods, exact: true }),
    onError: () => before && setBatch(recipeId, batchId)(before),
  });
}

export function restoreBatch(recipeId: string, batchId: string) {
  return run({
    scope: { id: `food:${recipeId}` },
    mutationFn: () => foodsApi.restoreBatch(recipeId, batchId),
    onSuccess: (batch) => setBatch(recipeId, batchId)(batch),
  });
}
