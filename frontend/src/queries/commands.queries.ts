import type { ComboInput, Entry, Food, FoodInput } from "@dash/core";
import * as commands from "../api/commands.api";
import { queryClient as qc } from "./client";
import { entriesChanged, putEntries, putFoods } from "./cache";
import { run } from "./run";

/** Commands wait for the server, since only it knows every row they touch. */
function applied(r: { foods: Food[]; entries: Entry[] }) {
  putFoods(qc, r.foods);
  putEntries(qc, r.entries);
  entriesChanged(qc);
}

export const mergeFood = (id: string, targetId: string) =>
  run({ scope: { id: `food:${id}` }, mutationFn: () => commands.merge(id, targetId), onSuccess: applied });

export const completeAsCombo = (id: string, combo: ComboInput, newFoods?: FoodInput[]) =>
  run({ scope: { id: `food:${id}` }, mutationFn: () => commands.completeAsCombo(id, combo, newFoods), onSuccess: applied });

export const reconvertLines = (lineIds: string[]) => run({ mutationFn: () => commands.reconvert(lineIds), onSuccess: applied });

export const moveLinesToBatch = (lineIds: string[], batchId: string) =>
  run({ mutationFn: () => commands.moveToBatch(lineIds, batchId), onSuccess: applied });

/** Quiet: a 409 ("edited since") or 410 ("expired") gets its own message from the caller. */
export const undo = (token: string) => run({ meta: { quiet: true }, mutationFn: () => commands.undo(token), onSuccess: applied });
