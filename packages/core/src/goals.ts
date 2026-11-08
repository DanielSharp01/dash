import { deepEqual } from "./equal";
import { daysBetween, shiftDate } from "./time";
import { bodyKgAt } from "./weighIns";
import { type AreaValue, BEGINNING, type MacroPlan, type MacroPreset, type Plan, type PlanArea, type PlanAreas, type ProfileInput, type WeighIn } from "./schemas";

export const KCAL_PER_KG = 7700;
/** Below this, eating enough protein and micronutrients gets hard; common clinical floor for unsupervised diets. */
export const MIN_KCAL = 1200;
const FALLBACK = { kcal: 1800, protein: 110, carbs: 200, fat: 60 };
/** An average adult, standing in for whatever body details are missing. */
const AVERAGE_CM = 170;
const AVERAGE_AGE = 40;

/** Starting points; moving the sliders off one makes the plan "custom". */
export const macroPresets: Record<Exclude<MacroPreset, "custom">, { label: string; plan: MacroPlan }> = {
  balanced: { label: "Balanced", plan: { preset: "balanced", proteinPerKg: 1.6, fatPct: 0.3 } },
  "high-protein": { label: "High protein", plan: { preset: "high-protein", proteinPerKg: 2, fatPct: 0.25 } },
  "low-carb": { label: "Low carb", plan: { preset: "low-carb", proteinPerKg: 1.6, carbPct: 0.2 } },
  keto: { label: "Keto", plan: { preset: "keto", proteinPerKg: 1.6, carbPct: 0.05 } },
  "low-fat": { label: "Low fat", plan: { preset: "low-fat", proteinPerKg: 1.6, fatPct: 0.2 } },
};

export const macroPresetLabel = (preset: MacroPreset) => (preset === "custom" ? "Custom" : macroPresets[preset].label);

/**
 * The plan for grams set by hand, kept relative so they follow the budget and the protein weight as
 * they change: protein per kg of that weight, fat as a share of the budget, carbs whatever is left.
 */
export function customMacroPlan(proteinG: number, fatG: number, calc: { proteinKg: number; budgetKcal: number }): MacroPlan {
  return { preset: "custom", proteinPerKg: Math.round((proteinG / calc.proteinKg) * 1000) / 1000, fatPct: Math.round(((fatG * 9) / calc.budgetKcal) * 10000) / 10000 };
}

/** Starting points for the metabolism multiplier, described by what a normal day looks like. */
export const metabolismPresets = [
  { value: 1.2, label: "Desk day" },
  { value: 1.375, label: "Walk around some" },
  { value: 1.55, label: "On my feet all day" },
  { value: 1.725, label: "Physical job" },
];

export const defaultPlan: Plan = {
  goal: { kgPerWeek: 0.5 },
  metabolismMultiplier: 1.2,
  fluidGoalMl: 2000,
  macroPlan: macroPresets.balanced.plan,
};

export const defaultProfile: ProfileInput = { dayEndsAt: 0, clock: "24h", autoRecap: true, shareVerified: true };

export interface DailyTargets {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  /** Absent when weight, height or age is missing and the fallback is used. */
  calc?: { bmr: number; maintenance: number; deficit: number; clamped: boolean; bodyKg: number; budgetKcal: number; proteinKg: number };
  /** Without calc, maintenance guessed from an average adult; too rough for anything but telling a big day. */
  estimatedMaintenance?: number;
  fluidMl: number;
  plan: Plan;
  missing: ("weight" | "height" | "age")[];
}

/** The part of a plan each area keeps versions of. */
const areaOf: { [A in PlanArea]: (plan: Plan) => AreaValue<A> } = {
  goal: (p) => ({ goal: p.goal }),
  metabolism: (p) => ({ metabolismMultiplier: p.metabolismMultiplier, ...(p.calibratedFrom ? { calibratedFrom: p.calibratedFrom } : {}) }),
  fluid: (p) => ({ fluidGoalMl: p.fluidGoalMl }),
  macros: (p) => ({ macroPlan: p.macroPlan }),
};
const planAreas = Object.keys(areaOf) as PlanArea[];

/** The part of `plan` that `area` keeps versions of. */
export const planAreaValue = <A extends PlanArea>(area: A, plan: Plan): AreaValue<A> => areaOf[area](plan);

export type Dated<V> = { from: string; value: V };
type PlanChange = "fix" | { from: string };

const valueAt = <V>(versions: Dated<V>[], date?: string) => (date ? ([...versions].reverse().find((v) => v.from <= date) ?? versions[0]) : versions.at(-1))?.value;

/** The plan in effect on a day, each area's version on it; without a date, the current one. */
export function planAt(history: PlanAreas, date?: string): Plan {
  return {
    ...defaultPlan,
    ...valueAt(history.goal, date),
    ...valueAt(history.metabolism, date),
    ...valueAt(history.fluid, date),
    ...valueAt(history.macros, date),
  };
}

export const samePlan = (a: Plan, b: Plan) => deepEqual(a, b);

/** Neighbouring versions with the same value say nothing; keep the earlier one. */
const collapse = <V>(versions: Dated<V>[]) => versions.filter((v, i) => i === 0 || !deepEqual(v.value, versions[i - 1]!.value));

/** One area's versions as edited on its History page, or undefined when nothing changed. */
export function replaceAreaVersions<A extends PlanArea>(history: PlanAreas, area: A, versions: Dated<AreaValue<A>>[]): PlanAreas | undefined {
  const next = collapse(versions);
  return deepEqual(next, history[area]) ? undefined : { ...history, [area]: next };
}

/** One area's versions after the change, or undefined when the area already holds that value. */
function changeArea<V>(versions: Dated<V>[], value: V, fallback: V, change: PlanChange): Dated<V>[] | undefined {
  const history = versions.length ? versions : [{ from: BEGINNING, value: fallback }];
  if (deepEqual(history.at(-1)!.value, value)) return undefined;
  const updated =
    change === "fix" ? [...history.slice(0, -1), { ...history.at(-1)!, value }] : [...history.filter((v) => v.from < change.from), { from: change.from, value }];
  return collapse(updated);
}

/**
 * Changes only the areas whose values differ. "fix" rewrites an area's current version, so past
 * days change too; a date starts a new version there and leaves earlier days alone. A date on the
 * current version's day replaces it. Undefined when the plan is the current one.
 */
export function applyPlanChange(history: PlanAreas, next: Plan, change: PlanChange): PlanAreas | undefined {
  const goal = changeArea(history.goal, areaOf.goal(next), areaOf.goal(defaultPlan), change);
  const metabolism = changeArea(history.metabolism, areaOf.metabolism(next), areaOf.metabolism(defaultPlan), change);
  const fluid = changeArea(history.fluid, areaOf.fluid(next), areaOf.fluid(defaultPlan), change);
  const macros = changeArea(history.macros, areaOf.macros(next), areaOf.macros(defaultPlan), change);
  if (!goal && !metabolism && !fluid && !macros) return undefined;
  return { goal: goal ?? history.goal, metabolism: metabolism ?? history.metabolism, fluid: fluid ?? history.fluid, macros: macros ?? history.macros };
}

/** A new version for `next` can't start before this without dropping later versions of an area it changes. */
export function changeStartsFrom(history: PlanAreas, next: Plan): string {
  const current = planAt(history);
  return planAreas
    .filter((a) => !deepEqual(areaOf[a](next), areaOf[a](current)))
    .map((a) => history[a].at(-1)?.from ?? BEGINNING)
    .reduce((latest, from) => (from > latest ? from : latest), BEGINNING);
}

/** Whole-plan versions, as older backups and new accounts start out, as per-area versions. */
export function splitPlanVersions(versions: { from: string; plan: Plan }[]): PlanAreas {
  const area = <A extends PlanArea>(a: A) => collapse(versions.map((v) => ({ from: v.from, value: areaOf[a](v.plan) })));
  return { goal: area("goal"), metabolism: area("metabolism"), fluid: area("fluid"), macros: area("macros") };
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

export function dailyTargets(profile: ProfileInput, history: PlanAreas, weighIns: WeighIn[], date?: string): DailyTargets {
  const body = bodyKgAt(weighIns, date);
  const missing: DailyTargets["missing"] = [];
  if (!body.known) missing.push("weight");
  if (!profile.heightCm) missing.push("height");
  if (!profile.birthday) missing.push("age");
  const plan = planAt(history, date);
  const on = date ? new Date(`${date}T12:00:00`) : new Date();
  if (missing.length || !profile.heightCm || !profile.birthday) {
    const age = profile.birthday ? ageOn(profile.birthday, on) : AVERAGE_AGE;
    const estimatedMaintenance = restingBurn(body.kg, profile.heightCm ?? AVERAGE_CM, age, profile.sex) * plan.metabolismMultiplier;
    return { ...FALLBACK, estimatedMaintenance, fluidMl: plan.fluidGoalMl, plan, missing };
  }

  const age = ageOn(profile.birthday, on);
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
    calc: { bmr, maintenance, deficit, clamped: maintenance - deficit < MIN_KCAL, bodyKg: body.kg, budgetKcal: kcal, proteinKg },
    fluidMl: plan.fluidGoalMl,
    plan,
    missing,
  };
}

/**
 * What each stretch of unchanged goal and metabolism planned, for days `from` to `to`: a line from
 * the weight on its first day, down at its pace until the target. A stretch from before any dated
 * version starts at the first weigh-in in view. One list of points per stretch.
 */
export function plannedWeight(history: PlanAreas, weighIns: WeighIn[], from: string, to: string): { date: string; kg: number }[][] {
  const firstInView = weighIns.find((w) => w.date >= from && w.date <= to)?.date;
  if (!firstInView) return [];
  const starts = [...new Set([...history.goal, ...history.metabolism].map((v) => v.from).filter((f) => f !== BEGINNING))].sort();
  return [BEGINNING, ...starts].flatMap((start, i, all) => {
    const next = all[i + 1];
    const begin = start === BEGINNING ? firstInView : start;
    const stop = next !== undefined && next < to ? next : to;
    if (begin >= stop || stop < from) return [];
    const { goal } = planAt(history, begin);
    const anchor = bodyKgAt(weighIns, begin).kg;
    const floor = goal.targetKg !== undefined && goal.targetKg < anchor ? goal.targetKg : undefined;
    // Already at or under the target, the plan is to hold.
    const pace = goal.targetKg !== undefined && floor === undefined ? 0 : goal.kgPerWeek;
    const at = (date: string) => ({ date, kg: Math.max(anchor - (pace * daysBetween(begin, date)) / 7, floor ?? -Infinity) });
    const first = begin < from ? from : begin;
    const reached = floor !== undefined && pace > 0 ? shiftDate(begin, Math.ceil(((anchor - floor) / pace) * 7)) : undefined;
    const dates = [first, ...(reached !== undefined && reached > first && reached < stop ? [reached] : []), stop];
    return [dates.map(at)];
  });
}

/**
 * Where the planned pace takes you from a weigh-in up to `to`, levelling off once it reaches the
 * target: the plan carried on from where you actually are rather than from where it started.
 */
export function projectedWeight(start: { date: string; kg: number }, goal: Plan["goal"], to: string): { date: string; kg: number }[] {
  const { kgPerWeek, targetKg } = goal;
  const heading = targetKg !== undefined && kgPerWeek !== 0 && (kgPerWeek > 0 ? targetKg < start.kg : targetKg > start.kg);
  const at = (date: string) => {
    const kg = start.kg - (kgPerWeek * daysBetween(start.date, date)) / 7;
    return { date, kg: heading ? (kgPerWeek > 0 ? Math.max(kg, targetKg) : Math.min(kg, targetKg)) : kg };
  };
  const reached = heading ? shiftDate(start.date, Math.ceil(((start.kg - targetKg) / kgPerWeek) * 7)) : undefined;
  return [start.date, ...(reached !== undefined && reached < to ? [reached] : []), to].map(at);
}

/**
 * The weight logged eating implies: from a weigh-in, each day moves it by what was eaten minus what
 * was burned, with resting burn worked out from the weight so far. A day with no food logged counts
 * as eating maintenance, so it holds the weight. Each point is the morning after its day. Needs
 * height and birthday.
 */
export function loggedWeight(
  profile: ProfileInput,
  history: PlanAreas,
  start: { date: string; kg: number },
  days: { date: string; eaten?: number; burned: number }[],
): { date: string; kg: number }[] | undefined {
  const { heightCm, birthday } = profile;
  if (!heightCm || !birthday) return undefined;
  let kg = start.kg;
  const points = [{ date: start.date, kg }];
  for (const day of days) {
    if (day.eaten !== undefined) {
      const multiplier = planAt(history, day.date).metabolismMultiplier;
      const maintenance = restingBurn(kg, heightCm, ageOn(birthday, new Date(`${day.date}T12:00:00`)), profile.sex) * multiplier;
      kg += (day.eaten - maintenance - day.burned) / KCAL_PER_KG;
    }
    points.push({ date: shiftDate(day.date, 1), kg });
  }
  return points;
}
