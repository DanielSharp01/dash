import { useSyncExternalStore } from "react";
import { read, write } from "./persist";

const KEY = "dash.myActivities.v1";

/** null means the person hasn't picked yet, which sends them to the catalogue first. */
let mine: string[] | null = load();
const listeners = new Set<() => void>();

function load(): string[] | null {
  return read<string[] | null>(KEY, null);
}

export function setMyActivities(next: string[]) {
  mine = next;
  write(KEY, next);
  listeners.forEach((l) => l());
}

export function toggleMyActivity(id: string) {
  const current = mine ?? [];
  setMyActivities(current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);
}

export function useMyActivities() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => mine,
  );
}
