import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { Activity, ActivityInput } from "@dash/core";
import * as activitiesApi from "../api/activities.api";
import { queryClient as qc } from "./client";
import { cachedActivity, entriesChanged, mergeRows, putActivities } from "./cache";
import { keys } from "./keys";
import { optimistic, run } from "./run";

export const activitiesQuery = queryOptions({
  queryKey: keys.activities,
  queryFn: () => activitiesApi.getActivities().then((r) => r.activities),
  refetchOnWindowFocus: "always",
});

export const activityUsageQuery = queryOptions({
  queryKey: keys.activityUsage,
  queryFn: () => activitiesApi.getActivityUsage().then((r) => r.usage),
});

/** Deleted ones included, since past entries point at them. */
export const useActivities = () => useSuspenseQuery(activitiesQuery).data;

export function useActivityLookup() {
  const all = useActivities();
  return useMemo(() => {
    const byId = new Map(all.map((a) => [a.id, a]));
    return (id: string | undefined) => (id ? byId.get(id) : undefined);
  }, [all]);
}

/** Newest first. */
export const useActivityUsage = () => useSuspenseQuery(activityUsageQuery).data;

export const asNewActivity = (input: ActivityInput): Activity => ({ ...input, revision: 0, deleted: false, public: false, starter: false });

const setActivity = (id: string) => (row: Activity | undefined) =>
  qc.setQueryData<Activity[]>(keys.activities, (old) => (row ? mergeRows(old, [row]) : old?.filter((a) => a.id !== id)));

export function saveActivity(input: ActivityInput) {
  const existing = cachedActivity(qc, input.id);
  return optimistic({
    scope: `activity:${input.id}`,
    get: () => cachedActivity(qc, input.id),
    set: setActivity(input.id),
    next: existing ? { ...existing, ...input } : asNewActivity(input),
    send: () => {
      const revision = cachedActivity(qc, input.id)?.revision ?? 0;
      return revision === 0 ? activitiesApi.postActivity(input) : activitiesApi.putActivity({ ...input, revision });
    },
    stored: (a) => a,
  });
}

export function deleteActivity(id: string) {
  let before: Activity | undefined;
  return run({
    scope: { id: `activity:${id}` },
    onMutate: () => {
      before = cachedActivity(qc, id);
      if (before) setActivity(id)({ ...before, deleted: true });
    },
    mutationFn: () => activitiesApi.deleteActivity(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.activities, exact: true });
      entriesChanged(qc);
    },
    onError: () => before && setActivity(id)(before),
  });
}

export function restoreActivity(id: string) {
  return run({
    scope: { id: `activity:${id}` },
    mutationFn: () => activitiesApi.restoreActivity(id),
    onSuccess: (a) => {
      putActivities(qc, [a]);
      entriesChanged(qc);
    },
  });
}
