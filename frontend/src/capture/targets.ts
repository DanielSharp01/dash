import { dailyTargets } from "@dash/core";
import { useMe } from "../queries/me.queries";
import { useWeighIns } from "../queries/weighIns.queries";

export function useDailyTargets(date?: string) {
  const { profile, plan } = useMe();
  return dailyTargets(profile, plan.versions, useWeighIns(), date);
}
