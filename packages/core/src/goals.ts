import { deepEqual } from "./equal";
import { bodyKgAt } from "./weighIns";
import { BEGINNING, type MacroPlan, type MacroPreset, type Plan, type PlanVersion, type ProfileInput, type WeighIn } from "./schemas";

export const KCAL_PER_KG = 7700;
/** Below this, eating enough protein and micronutrients gets hard; common clinical floor for unsupervised diets. */
export const MIN_KCAL = 1200;
const FALLBACK = { kcal: 1800, protein: 110, carbs: 200, fat: 60 };

export const macroPresets: Record<MacroPreset, { label: string; plan: MacroPlan }> = {
  balanced: { label: "Balanced", plan: { preset: "balanced", proteinPerKg: 1.6, fatPct: 0.3 } },
  "high-protein": { label: "High protein", plan: { preset: "high-protein", proteinPerKg: 2, fatPct: 0.25 } },
  "low-carb": { label: "Low carb", plan: { preset: "low-carb", proteinPerKg: 1.6, carbPct: 0.2 } },
  keto: { label: "Keto", plan: { preset: "keto", proteinPerKg: 1.6, carbPct: 0.05 } },
  "low-fat": { label: "Low fat", plan: { preset: "low-fat", proteinPerKg: 1.6, fatPct: 0.2 } },
};

export const defaultPlan: Plan = {
  goal: { kgPerWeek: 0.5 },
  metabolismMultiplier: 1.2,
  fluidGoalMl: 2000,
  macroPlan: macroPresets.balanced.plan,
};

export const defaultProfile: ProfileInput = { units: "metric", dayEndsAt: 0, clock: "24h", autoRecap: true };

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

/** The plan in effect on a day; without a date, the current one. Versions are oldest first. */
export function planAt(versions: PlanVersion[], date?: string): Plan {
  if (!versions.length) return defaultPlan;
  if (!date) return versions[versions.length - 1]!.plan;
  return ([...versions].reverse().find((h) => h.from <= date) ?? versions[0]!).plan;
}

export const samePlan = (a: Plan, b: Plan) => deepEqual(a, b);

/** Neighbouring versions with the same plan say nothing; keep the earlier one. */
export const collapseHistory = (versions: PlanVersion[]) => versions.filter((h, i) => i === 0 || !samePlan(h.plan, versions[i - 1]!.plan));

/**
 * "fix" rewrites the plan in effect now, so past days change too; a date starts a new version
 * there and leaves earlier days alone. A date on the current version's day replaces it.
 * Returns undefined when the plan is the current one, since then nothing changes.
 */
export function applyPlanChange(versions: PlanVersion[], next: Plan, change: "fix" | { from: string }): PlanVersion[] | undefined {
  if (versions.length && samePlan(next, planAt(versions))) return undefined;
  const history = versions.length ? versions : [{ from: BEGINNING, plan: defaultPlan }];
  const updated =
    change === "fix"
      ? [...history.slice(0, -1), { ...history[history.length - 1]!, plan: next }]
      : [...history.filter((h) => h.from < change.from), { from: change.from, plan: next }];
  return collapseHistory(updated);
}

/** Mifflin–St Jeor; the sex term is the formula's, averaged when not given. */
export function restingBurn(kg: number, cm: number, age: number, sex?: ProfileInput["sex"]) {
  const s = sex === "male" ? 5 : sex === "female" ? -161 : -78;
  return 10 * kg + 6.25 * cm - 5 * age + s;
}

export function ageOn(birthday: string, date: Date = new Date()) {
  const [y, m, d] = birthday.split("-").map(Number) as [number, number, number];
  const hadBirthday = date.getMonth() + 1 > m || (date.getMonth() + 1 === m && date.getDate() >= d);
  return date.getFullYear() - y - (hadBirthday ? 0 : 1);
}

export function dailyTargets(profile: ProfileInput, versions: PlanVersion[], weighIns: WeighIn[], date?: string): DailyTargets {
  const body = bodyKgAt(weighIns, date);
  const missing: DailyTargets["missing"] = [];
  if (!body.known) missing.push("weight");
  if (!profile.heightCm) missing.push("height");
  if (!profile.birthday) missing.push("age");
  const plan = planAt(versions, date);
  if (missing.length || !profile.heightCm || !profile.birthday) return { ...FALLBACK, fluidMl: plan.fluidGoalMl, plan, missing };

  const age = ageOn(profile.birthday, date ? new Date(`${date}T12:00:00`) : new Date());
  const bmr = restingBurn(body.kg, profile.heightCm, age, profile.sex);
  const maintenance = bmr * plan.metabolismMultiplier;
  const deficit = (plan.goal.kgPerWeek * KCAL_PER_KG) / 7;
  const kcal = Math.max(maintenance - deficit, MIN_KCAL);

  // Protein follows a healthy-range weight, since current weight overstates the need at high BMI;
  // a target weight stands in for it, but is capped the same way.
  const healthyMaxKg = 25 * (profile.heightCm / 100) ** 2;
  const proteinKg = Math.min(plan.goal.targetKg ?? body.kg, healthyMaxKg);
  const m = plan.macroPlan;
  const protein = m.proteinPerKg * proteinKg;
  const left = Math.max(0, kcal - protein * 4);
  // A fat share on top of a large protein need could outgrow the budget; fat gives way so the macros still add up.
  const fat = m.carbPct !== undefined ? Math.max(0, left - m.carbPct * kcal) / 9 : Math.min((m.fatPct ?? 0.3) * kcal, left) / 9;
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
