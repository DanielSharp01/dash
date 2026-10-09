import { useSyncExternalStore } from "react";
import { read, write } from "./persist";
import { normalizeItem } from "./measures";
import type { Item } from "./types";

const KEY = "dash.items.v1";

let items: Item[] = load();
const listeners = new Set<() => void>();

function load(): Item[] {
  return read<Item[]>(KEY, []).map(normalizeItem);
}

export const userItems = () => items;

/** Adds the item, or replaces the stored one with the same id. */
export function saveUserItem(item: Item) {
  commit(items.some((i) => i.id === item.id) ? items.map((i) => (i.id === item.id ? item : i)) : [...items, item]);
}

export const removeUserItem = (id: string) => commit(items.filter((i) => i.id !== id));
export const replaceUserItems = (next: Item[]) => commit(next);

function commit(next: Item[]) {
  items = next;
  write(KEY, items);
  listeners.forEach((l) => l());
}

/** Re-renders when the person creates an item, so lists and lookups pick it up. */
export function useUserItems() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => items,
  );
}
