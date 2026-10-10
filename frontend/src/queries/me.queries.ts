import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { applyPlanChange, type MeResponse, type Plan, type PlanHistory, type Profile, type ProfileInput } from "@dash/core";
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

/** "fix" rewrites the current plan; a date starts a new one there. Saving the current plan does nothing. */
export function savePlan(plan: Plan, change: "fix" | { from: string }) {
  const history = me()?.plan;
  const versions = history && applyPlanChange(history.versions, plan, change);
  if (!history || !versions) return;
  return optimistic<PlanHistory, PlanHistory>({
    scope: "plan",
    get: () => me()?.plan,
    set: (p) => p && patchMe({ plan: p }),
    next: { ...history, versions },
    send: () => meApi.postPlan({ plan, change, revision: me()!.plan.revision }),
    stored: (p) => p,
  });
}
