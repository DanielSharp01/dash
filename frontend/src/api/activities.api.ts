import type { Activity, ActivityInput, ActivityUsage } from "@dash/core";
import { api } from "./client";

export const getActivities = () => api.get<{ activities: Activity[] }>("/activities");
export const getActivityUsage = () => api.get<{ usage: ActivityUsage[] }>("/activities/usage");
export const postActivity = (a: ActivityInput) => api.post<Activity>("/activities", a);
export const putActivity = (a: ActivityInput & { revision: number }) => api.put<Activity>(`/activities/${a.id}`, a);
export const deleteActivity = (id: string) => api.delete(`/activities/${id}`);
export const restoreActivity = (id: string) => api.post<Activity>(`/activities/${id}/restore`);
