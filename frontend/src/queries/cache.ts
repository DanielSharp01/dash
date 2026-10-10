import type { QueryClient } from "@tanstack/react-query";
import type { Activity, Entry, Food } from "@dash/core";
import { isDayKey, keys } from "./keys";

type Row = { id: string };

/** Replaces rows by id and appends new ones, keeping the list's identity when nothing changed. */
export function mergeRows<T extends Row>(list: T[] | undefined, rows: T[]): T[] | undefined {
  if (!list || !rows.length) return list;
  const byId = new Map(rows.map((r) => [r.id, r]));
  const merged = list.map((x) => byId.get(x.id) ?? x);
  const known = new Set(list.map((x) => x.id));
  return [...merged, ...rows.filter((r) => !known.has(r.id))];
}

export const putFoods = (qc: QueryClient, foods: Food[]) => qc.setQueryData<Food[]>(keys.foods, (old) => mergeRows(old, foods));
export const putActivities = (qc: QueryClient, activities: Activity[]) => qc.setQueryData<Activity[]>(keys.activities, (old) => mergeRows(old, activities));

export const cachedFood = (qc: QueryClient, id: string) => qc.getQueryData<Food[]>(keys.foods)?.find((f) => f.id === id);
export const cachedActivity = (qc: QueryClient, id: string) => qc.getQueryData<Activity[]>(keys.activities)?.find((a) => a.id === id);

/** Day caches hold live entries only; an entry whose date changed moves to the new day. */
export function putEntries(qc: QueryClient, entries: Entry[]) {
  if (!entries.length) return;
  for (const [key, list] of qc.getQueriesData<Entry[]>({ queryKey: keys.entries })) {
    if (!list || !isDayKey(key)) continue;
    const date = key[1];
    const here = entries.filter((e) => e.when.date === date && !e.deleted);
    const gone = new Set(entries.filter((e) => e.when.date !== date || e.deleted).map((e) => e.id));
    if (!here.length && !list.some((e) => gone.has(e.id))) continue;
    qc.setQueryData<Entry[]>(key, mergeRows(list.filter((e) => !gone.has(e.id)), here));
  }
}

/** Day caches are kept current by every write; the other lists only get refetched. */
export function cachedEntry(qc: QueryClient, id: string) {
  for (const [key, list] of qc.getQueriesData<Entry[]>({ queryKey: keys.entries })) {
    const found = isDayKey(key) ? list?.find((e) => e.id === id) : undefined;
    if (found) return found;
  }
  return undefined;
}

/** What is derived from every entry on the server; refetched rather than worked out here. */
export function entriesChanged(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: keys.followUp });
  void qc.invalidateQueries({ queryKey: keys.foodUsage, exact: true });
  void qc.invalidateQueries({ queryKey: keys.activityUsage, exact: true });
  void qc.invalidateQueries({ queryKey: ["entries", "food"] });
  void qc.invalidateQueries({ queryKey: ["entries", "range"] });
}
