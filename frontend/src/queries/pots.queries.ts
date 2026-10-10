import type { MeResponse, Pot } from "@dash/core";
import * as potsApi from "../api/pots.api";
import { queryClient as qc } from "./client";
import { keys } from "./keys";
import { run } from "./run";

const setPots = (fn: (pots: Pot[]) => Pot[]) => qc.setQueryData<MeResponse>(keys.me, (old) => old && { ...old, pots: fn(old.pots) });

export function addPot(pot: Pot) {
  return run({
    scope: { id: `pot:${pot.id}` },
    onMutate: () => setPots((pots) => [...pots, pot]),
    mutationFn: () => potsApi.postPot(pot),
    onError: () => setPots((pots) => pots.filter((p) => p.id !== pot.id)),
  });
}

export function removePot(pot: Pot) {
  return run({
    scope: { id: `pot:${pot.id}` },
    onMutate: () => setPots((pots) => pots.filter((p) => p.id !== pot.id)),
    mutationFn: () => potsApi.deletePot(pot.id),
    onError: () => setPots((pots) => [...pots, pot]),
  });
}
