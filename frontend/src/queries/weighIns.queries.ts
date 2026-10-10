import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import type { WeighIn } from "@dash/core";
import * as weighInsApi from "../api/weighIns.api";
import { queryClient as qc } from "./client";
import { keys } from "./keys";
import { run } from "./run";

const oldestFirst = (all: WeighIn[]) => [...all].sort((a, b) => a.date.localeCompare(b.date));

export const weighInsQuery = queryOptions({ queryKey: keys.weighIns, queryFn: () => weighInsApi.getWeighIns().then((r) => oldestFirst(r.weighIns)) });

/** Oldest first. */
export const useWeighIns = () => useSuspenseQuery(weighInsQuery).data;

function change(fn: (all: WeighIn[]) => WeighIn[]) {
  const before = qc.getQueryData<WeighIn[]>(keys.weighIns);
  qc.setQueryData<WeighIn[]>(keys.weighIns, (old) => old && oldestFirst(fn(old)));
  return () => qc.setQueryData(keys.weighIns, before);
}

/** A second weigh-in on a day replaces the first, on the server too. */
export function addWeighIn(w: WeighIn) {
  let undo = () => {};
  return run({
    scope: { id: "weigh-ins" },
    onMutate: () => {
      undo = change((all) => [...all.filter((x) => x.date !== w.date), w]);
    },
    mutationFn: () => weighInsApi.postWeighIn(w),
    onError: () => undo(),
  });
}

export function removeWeighIn(id: string) {
  let undo = () => {};
  return run({
    scope: { id: "weigh-ins" },
    onMutate: () => {
      undo = change((all) => all.filter((x) => x.id !== id));
    },
    mutationFn: () => weighInsApi.deleteWeighIn(id),
    onError: () => undo(),
  });
}
