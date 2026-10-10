import type { CommandResult, ComboInput, FoodInput, UndoResult } from "@dash/core";
import { api } from "./client";

export const merge = (id: string, targetId: string) => api.post<CommandResult>(`/foods/${id}/merge`, { targetId });
export const completeAsCombo = (id: string, combo: ComboInput, newFoods?: FoodInput[]) =>
  api.post<CommandResult>(`/foods/${id}/complete-as-combo`, { combo, newFoods });
export const reconvert = (lineIds: string[]) => api.post<CommandResult>("/entries/reconvert", { lineIds });
export const moveToBatch = (lineIds: string[], batchId: string) => api.post<CommandResult>("/entries/move-to-batch", { lineIds, batchId });
export const undo = (token: string) => api.post<UndoResult>(`/undo/${token}`);
