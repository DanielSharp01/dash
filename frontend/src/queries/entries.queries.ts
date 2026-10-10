import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { Activity, ActivityInput, Entry, EntryInput, Food, FoodInput } from "@dash/core";
import * as entriesApi from "../api/entries.api";
import { queryClient as qc } from "./client";
import { cachedActivity, cachedEntry, cachedFood, entriesChanged, putActivities, putEntries, putFoods } from "./cache";
import { asNewActivity } from "./activities.queries";
import { asNewFood } from "./foods.queries";
import { keys } from "./keys";
import { optimistic, run } from "./run";

export const dayQuery = (date: string) =>
  queryOptions({ queryKey: keys.day(date), queryFn: () => entriesApi.getEntries({ from: date, to: date }).then((r) => r.entries) });

/** One day at a time, as the screens show them; nothing loads the whole history. */
export const useDayEntries = (date: string) => useQuery(dayQuery(date));

export const useEntriesBetween = (from: string, to: string) =>
  useQuery({ queryKey: keys.entriesBetween(from, to), queryFn: () => entriesApi.getEntries({ from, to }).then((r) => r.entries) });

/** Entries with a line on the food, for an editor's "used by". */
export const useEntriesOfFood = (foodId: string) =>
  useQuery({
    queryKey: keys.entriesOfFood(foodId),
    queryFn: () => entriesApi.getEntries({ from: "1970-01-01", to: "9999-12-31", foodId }).then((r) => r.entries),
  });

export const followUpQuery = queryOptions({ queryKey: keys.followUp, queryFn: entriesApi.getFollowUp });

export const useFollowUp = () => useSuspenseQuery(followUpQuery).data;

export function useFollowUpCount() {
  const f = useFollowUp();
  return f.unsureItems.length + f.entries.length;
}

/** Shows what a save creates along the way, and takes it out again if the save fails. */
function showCreated(newFoods: FoodInput[], newActivities: ActivityInput[]) {
  const foods = newFoods.filter((f) => !cachedFood(qc, f.id)).map(asNewFood);
  const activities = newActivities.filter((a) => !cachedActivity(qc, a.id)).map(asNewActivity);
  putFoods(qc, foods);
  putActivities(qc, activities);
  const unsaved = (shown: { id: string }[]) => (x: { id: string; revision: number }) => x.revision === 0 && shown.some((s) => s.id === x.id);
  return () => {
    qc.setQueryData<Food[]>(keys.foods, (old) => old?.filter((f) => !unsaved(foods)(f)));
    qc.setQueryData<Activity[]>(keys.activities, (old) => old?.filter((a) => !unsaved(activities)(a)));
  };
}

/**
 * Creates or replaces the entry. `stored` is the entry being edited, for when its day isn't cached;
 * without it a create of an id the server already has would come back as the old row.
 */
export function saveEntry(input: EntryInput, extras: { newFoods?: FoodInput[]; newActivities?: ActivityInput[]; stored?: Entry } = {}) {
  const { newFoods = [], newActivities = [], stored } = extras;
  const existing = cachedEntry(qc, input.id) ?? stored;
  const next = { ...input, revision: existing?.revision ?? 0, deleted: false, createdAt: existing?.createdAt ?? new Date().toISOString() } as Entry;
  const hideCreated = showCreated(newFoods, newActivities);
  return optimistic({
    scope: `entry:${input.id}`,
    get: () => cachedEntry(qc, input.id),
    set: (row) => putEntries(qc, [row ?? { ...next, deleted: true }]),
    next,
    send: () => {
      const revision = cachedEntry(qc, input.id)?.revision ?? existing?.revision ?? 0;
      const body = { ...input, ...(newFoods.length ? { newFoods } : {}), ...(newActivities.length ? { newActivities } : {}) };
      return revision === 0 ? entriesApi.postEntry(body) : entriesApi.putEntry({ ...body, revision });
    },
    stored: (d) => d.entry,
    onSuccess: (d) => {
      putFoods(qc, d.newFoods);
      putActivities(qc, d.newActivities);
      entriesChanged(qc);
    },
    onError: hideCreated,
  }).then((d) => d.entry);
}

export function deleteEntry(entry: Entry) {
  return run({
    scope: { id: `entry:${entry.id}` },
    onMutate: () => putEntries(qc, [{ ...entry, deleted: true }]),
    mutationFn: () => entriesApi.deleteEntry(entry.id),
    onSuccess: () => entriesChanged(qc),
    onError: () => putEntries(qc, [entry]),
  });
}

export function restoreEntry(id: string) {
  return run({
    scope: { id: `entry:${id}` },
    mutationFn: () => entriesApi.restoreEntry(id),
    onSuccess: (entry) => {
      putEntries(qc, [entry]);
      entriesChanged(qc);
    },
  });
}
