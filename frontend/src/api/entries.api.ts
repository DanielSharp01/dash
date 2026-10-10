import type { ActivityInput, Entry, EntryInput, EntryResponse, FollowUp, FoodInput } from "@dash/core";
import { api, query } from "./client";

export type EntryExtras = { newFoods?: FoodInput[]; newActivities?: ActivityInput[] };

export const getEntries = (params: { from: string; to: string; foodId?: string }) => api.get<{ entries: Entry[] }>(`/entries${query(params)}`);
export const postEntry = (entry: EntryInput & EntryExtras) => api.post<EntryResponse>("/entries", entry);
export const putEntry = (entry: EntryInput & EntryExtras & { revision: number }) => api.put<EntryResponse>(`/entries/${entry.id}`, entry);
export const deleteEntry = (id: string) => api.delete(`/entries/${id}`);
export const restoreEntry = (id: string) => api.post<Entry>(`/entries/${id}/restore`);
export const getFollowUp = () => api.get<FollowUp>("/follow-up");
