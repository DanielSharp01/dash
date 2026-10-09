import { ageOn, currentProfile, type Plan, type Profile, updateProfile, useProfile } from "./profile";
import { bodyKgAt, useWeighIns, type WeighIn } from "./weighIns";

const KCAL_PER_KG = 7700;
/** Below this, eating enough protein and micronutrients gets hard; common clinical floor for unsupervised diets. */
export const MIN_KCAL = 1200;
const FALLBACK = { kcal: 1800, protein: 110, carbs: 200, fat: 60 };

export interface DailyTargets {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  /** Absent when weight, height or age is missing and the fallback is used. */
  calc?: { bmr: number; maintenance: number; deficit: number; clamped: boolean; bodyKg: number };
  fluidMl: number;
  plan: Plan;
  missing: ("weight" | "height" | "age")[];
}

const currentPlan = (p: Profile): Plan => ({
  goal: p.goal,
  metabolismMultiplier: p.metabolismMultiplier,
  calibratedFrom: p.calibratedFrom,
  fluidGoalMl: p.fluidGoalMl,
  macroPlan: p.macroPlan,
});

export function planAt(p: Profile, date?: string): Plan {
  const history = p.planHistory;
  if (!date || !history?.length) return currentPlan(p);
  return ([...history].reverse().find((h) => h.from <= date) ?? history[0]).plan;
}

export const samePlan = (a: Plan, b: Plan) => JSON.stringify(a) === JSON.stringify(b);

/** Neighbouring versions with the same plan say nothing; keep the earlier one. */
export const collapseHistory = (history: { from: string; plan: Plan }[]) =>
  history.filter((h, i) => i === 0 || !samePlan(h.plan, history[i - 1].plan));

/**
 * "fix" rewrites the plan in effect now, so past days change too; a date starts a new version
 * there and leaves earlier days alone. A date on the current version's day replaces it.
 */
export function savePlan(next: Plan, change: "fix" | { from: string }) {
  const p = currentProfile();
  if (samePlan(next, currentPlan(p))) return;
  const history = p.planHistory?.length ? p.planHistory : [{ from: "", plan: currentPlan(p) }];
  const updated =
    change === "fix"
      ? [...history.slice(0, -1), { ...history[history.length - 1], plan: next }]
      : [...history.filter((h) => h.from < change.from), { from: change.from, plan: next }];
  updateProfile({ ...next, planHistory: collapseHistory(updated) });
}

/** For settings that describe the body rather than the goal, like calibrating the multiplier. */
export const correctPlan = (patch: Partial<Plan>) => savePlan({ ...currentPlan(currentProfile()), ...patch }, "fix");

export const latestPlanStart = (p: Profile) => p.planHistory?.[p.planHistory.length - 1]?.from ?? "";

export { currentPlan };

/** Mifflin–St Jeor; the sex term is the formula's, averaged when not given. */
export function restingBurn(kg: number, cm: number, age: number, sex?: Profile["sex"]) {
  const s = sex === "male" ? 5 : sex === "female" ? -161 : -78;
  return 10 * kg + 6.25 * cm - 5 * age + s;
}

export function dailyTargets(profile: Profile, weighIns: WeighIn[], date?: string): DailyTargets {
  const body = bodyKgAt(weighIns, date);
  const missing: DailyTargets["missing"] = [];
  if (!body.known) missing.push("weight");
  if (!profile.heightCm) missing.push("height");
  if (!profile.birthday) missing.push("age");
  const plan = planAt(profile, date);
  if (missing.length) return { ...FALLBACK, fluidMl: plan.fluidGoalMl, plan, missing };

  const age = ageOn(profile.birthday!, date ? new Date(`${date}T12:00:00`) : new Date());
  const bmr = restingBurn(body.kg, profile.heightCm!, age, profile.sex);
  const maintenance = bmr * plan.metabolismMultiplier;
  const deficit = (plan.goal.kgPerWeek * KCAL_PER_KG) / 7;
  const kcal = Math.max(maintenance - deficit, MIN_KCAL);

  // Protein follows a healthy-range weight, since current weight overstates the need at high BMI.
  const healthyMaxKg = 25 * (profile.heightCm! / 100) ** 2;
  const proteinKg = plan.goal.targetKg ?? Math.min(body.kg, healthyMaxKg);
  const m = plan.macroPlan;
  const protein = m.proteinPerKg * proteinKg;
  const left = Math.max(0, kcal - protein * 4);
  const fat = m.carbPct !== undefined ? Math.max(0, left - m.carbPct * kcal) / 9 : ((m.fatPct ?? 0.3) * kcal) / 9;
  const carbs = m.carbPct !== undefined ? (m.carbPct * kcal) / 4 : Math.max(0, left - fat * 9) / 4;

  return {
    kcal: Math.round(kcal),
    protein: Math.round(protein),
    carbs: Math.round(carbs),
    fat: Math.round(fat),
    calc: { bmr, maintenance, deficit, clamped: maintenance - deficit < MIN_KCAL, bodyKg: body.kg },
    fluidMl: plan.fluidGoalMl,
    plan,
    missing,
  };
}

export function useDailyTargets(date?: string) {
  return dailyTargets(useProfile(), useWeighIns(), date);
}

/** When the target weight is reached at the chosen pace, if both are set and it's below today's weight. */
export function targetDate(currentKg: number, goal: Profile["goal"]) {
  if (!goal.targetKg || goal.kgPerWeek <= 0 || goal.targetKg >= currentKg) return undefined;
  const weeks = (currentKg - goal.targetKg) / goal.kgPerWeek;
  return new Date(Date.now() + weeks * 7 * 86_400_000);
}
