import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { applyPlanChange, type MeResponse, type Plan, type PlanArea, type PlanHistory, type Profile, type ProfileInput } from "@dash/core";
import * as meApi from "../api/me.api";
import { queryClient as qc } from "./client";
import { keys } from "./keys";
import { optimistic } from "./run";

export const meQuery = queryOptions({ queryKey: keys.me, queryFn: meApi.getMe });

export const useMe = () => useSuspenseQuery(meQuery).data;
export const useProfile = () => useMe().profile;
export const usePlanHistory = () => useMe().plan;

const me = () => qc.getQueryData<MeResponse>(keys.me);
const patchMe = (patch: Partial<MeResponse>) => qc.setQueryData<MeResponse>(keys.me, (old) => old && { ...old, ...patch });

export function saveProfile(patch: Partial<ProfileInput>) {
  const current = me()?.profile;
  if (!current) return;
  return optimistic<Profile, Profile>({
    scope: "profile",
    get: () => me()?.profile,
    set: (profile) => profile && patchMe({ profile }),
    next: { ...current, ...patch },
    send: () => {
      const { revision, ...profile } = me()!.profile;
      return meApi.putProfile({ ...profile, ...patch, revision });
    },
    stored: (p) => p,
  });
}

/** On the server, so a recap seen on one device doesn't play again on another. */
export const recapSeenOn = () => me()?.recapSeenOn;

export function markRecapSeen(day: string) {
  const seen = recapSeenOn();
  if (seen && seen >= day) return;
  patchMe({ recapSeenOn: day });
  // A failed save only means the recap may play once more, so it isn't retried or reported.
  void meApi.postRecapSeen(day).catch(() => undefined);
}

export function forgetRecapSeen() {
  qc.setQueryData<MeResponse>(keys.me, (old) => {
    if (!old) return old;
    const { recapSeenOn: _, ...rest } = old;
    return rest;
  });
  return meApi.deleteRecapSeen();
}

/**
 * "fix" rewrites the current plan; a date starts a new one there. `choose` marks areas as set even
 * when their values stay, so a new account can accept a default; with nothing new, it does nothing.
 */
export function savePlan(plan: Plan, change: "fix" | { from: string }, choose: PlanArea[]) {
  const history = me()?.plan;
  if (!history) return;
  const areas = applyPlanChange(history, plan, change);
  const chosen = [...new Set([...history.chosen, ...choose])];
  if (!areas && chosen.length === history.chosen.length) return;
  return optimistic<PlanHistory, PlanHistory>({
    scope: "plan",
    get: () => me()?.plan,
    set: (p) => p && patchMe({ plan: p }),
    next: { ...history, ...areas, chosen },
    send: () => meApi.postPlan({ plan, change, revision: me()!.plan.revision, choose }),
    stored: (p) => p,
  });
}
