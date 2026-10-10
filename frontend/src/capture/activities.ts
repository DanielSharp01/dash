import { useMemo } from "react";
import type { Activity } from "@dash/core";
import { useActivities } from "../queries/activities.queries";

/** Live activities, with a public one dropped once the person has their own copy of it. */
export function listedActivities(all: Activity[]) {
  const duplicated = new Set(all.filter((a) => !a.public && !a.deleted && a.originId).map((a) => a.originId));
  return all.filter((a) => !a.deleted && !(a.public && duplicated.has(a.id)));
}

export function useListedActivities() {
  const all = useActivities();
  return useMemo(() => listedActivities(all), [all]);
}
