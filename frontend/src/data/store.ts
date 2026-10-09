import { useSyncExternalStore } from "react";
import { read, write } from "./persist";
import { itemById } from "./catalogue";
import { measureInBase } from "./measures";
import { nutritionAt } from "./nutrition";
import type { Entry, FoodEntry } from "./types";

const KEY = "dash.entries.v1";

let entries: Entry[] = load();
const listeners = new Set<() => void>();

function load(): Entry[] {
  return read<Entry[]>(KEY, []);
}

function commit(next: Entry[]) {
  entries = next;
  write(KEY, next);
  listeners.forEach((l) => l());
}

export const addEntry = (e: Entry) => commit([...entries, e]);
export const removeEntry = (id: string) => commit(entries.filter((e) => e.id !== id));
export const updateEntry = (next: Entry) => commit(entries.map((e) => (e.id === next.id ? next : e)));
export const replaceEntries = (next: Entry[]) => commit(next);
export const storedEntries = () => entries;

export function useEntries() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => entries,
  );
}

export function recentIds<K extends Entry["kind"]>(all: Entry[], kind: K, pick: (e: Extract<Entry, { kind: K }>) => string | undefined) {
  const seen = new Set<string>();
  for (const e of [...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    if (e.kind !== kind) continue;
    const id = pick(e as Extract<Entry, { kind: K }>);
    if (id) seen.add(id);
  }
  return [...seen];
}

/** Returns undefined when the calories cannot be calculated; absent is never zero. */
export function calculatedKcal(e: FoodEntry): number | undefined {
  const item = itemById(e.itemId);
  const base = baseQuantity(e);
  const n = nutritionAt(item, e.when.date);
  if (!item || !n || base === undefined) return undefined;
  return item.baseUnit === "piece" ? n.kcal * base : (n.kcal * base) / 100;
}

export function baseQuantity(e: FoodEntry): number | undefined {
  const item = itemById(e.itemId);
  const { value, unit } = e.amount;
  if (!item || value === undefined || !unit) return undefined;
  const perUnit = measureInBase(item, unit);
  return perUnit === undefined ? undefined : value * perUnit;
}
