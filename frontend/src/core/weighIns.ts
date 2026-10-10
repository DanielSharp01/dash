import { useSyncExternalStore } from "react";
import { read, write } from "./persist";

const KEY = "dash.weighIns.v1";

export interface WeighIn {
  id: string;
  date: string;
  kg: number;
}

/** Used for exercise burn until the first weigh-in; an average adult, not a target. */
export const FALLBACK_KG = 75;

let weighIns: WeighIn[] = load();
const listeners = new Set<() => void>();

function load(): WeighIn[] {
  return read<WeighIn[]>(KEY, []);
}

function commit(next: WeighIn[]) {
  weighIns = [...next].sort((a, b) => a.date.localeCompare(b.date));
  write(KEY, weighIns);
  listeners.forEach((l) => l());
}

/** One weigh-in per day: a second one replaces the first. */
export const addWeighIn = (w: WeighIn) => commit([...weighIns.filter((x) => x.date !== w.date), w]);
export const removeWeighIn = (id: string) => commit(weighIns.filter((w) => w.id !== id));
export const weighInsSnapshot = () => weighIns;
export const restoreWeighIns = (all: WeighIn[]) => commit(all);

export function useWeighIns() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => weighIns,
  );
}

/** The weight that applied on a day: the last weigh-in on or before it, else the first one. */
export function bodyKgAt(all: WeighIn[], date?: string): { kg: number; known: boolean } {
  if (!all.length) return { kg: FALLBACK_KG, known: false };
  if (!date) return { kg: all[all.length - 1].kg, known: true };
  const before = [...all].reverse().find((w) => w.date <= date);
  return { kg: (before ?? all[0]).kg, known: true };
}
