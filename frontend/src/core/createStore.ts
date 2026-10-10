import { useSyncExternalStore } from "react";
import { read, write } from "./persist";

/** A value held in memory for synchronous rendering and written through to IndexedDB. */
export function createStore<T>(key: string, fallback: T) {
  let value = read<T>(key, fallback);
  const listeners = new Set<() => void>();
  const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  };

  return {
    get: () => value,
    set(next: T) {
      value = next;
      write(key, next);
      listeners.forEach((l) => l());
    },
    use: () => useSyncExternalStore(subscribe, () => value),
  };
}
