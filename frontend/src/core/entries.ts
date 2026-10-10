import { createStore } from "./createStore";
import type { Amount, Entry, FoodEntry } from "./types";

const store = createStore<Entry[]>("dash.entries.v1", []);

export const useEntries = store.use;
export const entriesSnapshot = store.get;
export const restoreEntries = store.set;

export function saveEntry(e: Entry) {
  const all = store.get();
  store.set(all.some((x) => x.id === e.id) ? all.map((x) => (x.id === e.id ? e : x)) : [...all, e]);
}

export const removeEntry = (id: string) => store.set(store.get().filter((e) => e.id !== id));

const newestFirst = (all: Entry[]) => [...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

/** The food a food entry was logged as: its combo, or its single item or recipe. */
export function loggedFoodId(e: FoodEntry) {
  if (e.comboId) return e.comboId;
  const [line] = e.lines;
  return e.lines.length === 1 ? (line.recipeId ?? line.itemId) : undefined;
}

/** Most recently logged first. */
export function recentFoodIds(all: Entry[], via?: FoodEntry["via"]) {
  const seen = new Set<string>();
  for (const e of newestFirst(all)) {
    if (e.kind !== "food" || (via && e.via !== via)) continue;
    const id = loggedFoodId(e);
    if (id) seen.add(id);
  }
  return [...seen];
}

/** Most often logged in the last 30 days first, so a daily coffee stays ahead of last week's juice. */
export function frequentFoodIds(all: Entry[], via: FoodEntry["via"], today: string) {
  const since = new Date(`${today}T12:00:00`);
  since.setDate(since.getDate() - 30);
  const from = since.toISOString().slice(0, 10);
  const counts = new Map<string, number>();
  for (const e of newestFirst(all)) {
    if (e.kind !== "food" || e.via !== via || e.when.date < from) continue;
    const id = loggedFoodId(e);
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

/** The amount used the last time this item or recipe was logged on its own. */
export function usualAmount(all: Entry[], foodId: string): Amount | undefined {
  for (const e of newestFirst(all)) {
    if (e.kind !== "food" || e.comboId || e.lines.length !== 1) continue;
    const [line] = e.lines;
    if ((line.itemId ?? line.recipeId) === foodId && line.amount.value !== undefined) return line.amount;
  }
  return undefined;
}

export function recentActivityIds(all: Entry[]) {
  const seen = new Set<string>();
  for (const e of newestFirst(all)) if (e.kind === "exercise" && e.activityId) seen.add(e.activityId);
  return [...seen];
}

export const entriesUsing = (all: Entry[], foodId: string) =>
  all.filter((e): e is FoodEntry => e.kind === "food" && e.lines.some((l) => l.itemId === foodId || l.recipeId === foodId));
