import { useSyncExternalStore } from "react";
import { read, write } from "./persist";
import type { Activity } from "./types";

const KEY = "dash.activities.v1";

let activities: Activity[] = load();
const listeners = new Set<() => void>();

function load(): Activity[] {
  return read<Activity[]>(KEY, []);
}

export const userActivities = () => activities;

/** Adds the activity, or replaces the stored one with the same id. */
export function saveUserActivity(activity: Activity) {
  commit(activities.some((a) => a.id === activity.id) ? activities.map((a) => (a.id === activity.id ? activity : a)) : [...activities, activity]);
}

export const removeUserActivity = (id: string) => commit(activities.filter((a) => a.id !== id));

function commit(next: Activity[]) {
  activities = next;
  write(KEY, activities);
  listeners.forEach((l) => l());
}

export function useUserActivities() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => activities,
  );
}
