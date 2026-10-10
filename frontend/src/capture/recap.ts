import { useMemo, useSyncExternalStore } from "react";
import { dailyTargets, dayRecap } from "@dash/core";
import { useQuery } from "@tanstack/react-query";
import { dayQuery, useRecapHistory } from "../queries/entries.queries";
import { useFoodLookup } from "../queries/foods.queries";
import { useMe } from "../queries/me.queries";
import { useWeighIns } from "../queries/weighIns.queries";
import { todayKey } from "./time";

export interface RecapRequest {
  date: string;
  /** The calendar flip into the new day; only when the recap opens on its own. */
  intro: boolean;
  /** Plays by itself after the rollover, so seeing it once is enough. */
  automatic: boolean;
}

let request: RecapRequest | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const playRecap = (r: RecapRequest) => {
  request = r;
  emit();
};

export const closeRecap = () => {
  request = undefined;
  emit();
};

export const currentRecap = () => request;

export const useRecapRequest = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => request,
  );

/**
 * `fresh` waits out a refetch of stale history instead of answering from it; a log saved since
 * the last load would otherwise be missing from the answer.
 */
export function useDayRecap(date: string | undefined, { fresh = false } = {}) {
  const { profile, plan } = useMe();
  const weighIns = useWeighIns();
  const foods = useFoodLookup();
  const { data: history, isFetching, isStale } = useRecapHistory(todayKey(), date !== undefined);
  // The day itself comes from its own cache, which every save updates at once; months of history
  // aren't reloaded for each log, and only streaks and the rest of the week come from there.
  const { data: day } = useQuery({ ...dayQuery(date ?? ""), enabled: date !== undefined });
  const settled = !fresh || !(isFetching && isStale);
  const recap = useMemo(() => {
    if (!date || !history) return undefined;
    const entries = day ? [...history.filter((e) => e.when.date !== date), ...day] : history;
    return dayRecap(date, entries, (d) => dailyTargets(profile, plan.versions, weighIns, d), foods);
  }, [date, history, day, profile, plan, weighIns, foods]);
  return settled ? recap : undefined;
}
