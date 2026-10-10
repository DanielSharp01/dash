import type { WeighIn } from "./schemas";

/** Used for exercise burn until the first weigh-in; an average adult, not a target. */
export const FALLBACK_KG = 75;

/** The weight that applied on a day: the last weigh-in on or before it, else the first one. Expects oldest first. */
export function bodyKgAt(all: WeighIn[], date?: string): { kg: number; known: boolean } {
  if (!all.length) return { kg: FALLBACK_KG, known: false };
  if (!date) return { kg: all[all.length - 1]!.kg, known: true };
  const before = [...all].reverse().find((w) => w.date <= date);
  return { kg: (before ?? all[0]!).kg, known: true };
}
