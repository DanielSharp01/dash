import { useMe } from "../../queries/me.queries";
import { useWeighIns } from "../../queries/weighIns.queries";

export const setupSteps = ["age", "sex", "height", "weight", "goal", "metabolism", "macros", "fluid"] as const;
export type SetupStep = (typeof setupSteps)[number];

/** Which steps are done: what the budget needs to know about you, then each goal area the person has chosen. */
export function useSetupProgress() {
  const { profile, plan } = useMe();
  const weighIns = useWeighIns();
  const done: Record<SetupStep, boolean> = {
    age: !!profile.birthday,
    // "Prefer not to say" leaves nothing stored, so moving on to height is what shows it was answered.
    sex: !!profile.sex || !!profile.heightCm,
    height: !!profile.heightCm,
    weight: weighIns.length > 0,
    goal: plan.chosen.includes("goal"),
    metabolism: plan.chosen.includes("metabolism"),
    macros: plan.chosen.includes("macros"),
    fluid: plan.chosen.includes("fluid"),
  };
  const left = setupSteps.filter((s) => !done[s]);
  return { left, done: setupSteps.length - left.length, total: setupSteps.length };
}
