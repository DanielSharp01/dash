import { useSyncExternalStore } from "react";
import { read, write } from "./persist";
import type { UnitSystem } from "./units";

const KEY = "dash.profile.v1";

export interface Profile {
  units: UnitSystem;
  heightCm?: number;
  /** A date key; asked as "I'm 29, born on 4 March" so nobody has to scroll to their birth year. */
  birthday?: string;
  /** Only for the resting-burn formula, which was fitted on male and female bodies; undefined uses the average. */
  sex?: "male" | "female";
  /**
   * Resting burn × this = a day's burn without logged exercise. It stands for everything Dash
   * doesn't log: daily movement, build, and the formula's own error. 1.2 is a desk day.
   */
  metabolismMultiplier: number;
  /** Set when the multiplier was worked out from a known maintenance intake rather than picked. */
  calibratedFrom?: { maintenanceKcal: number; loggedExerciseKcal: number };
  goal: Goal;
  /** Hour (0–6) when the day rolls over; staying up past midnight still counts as the evening before. */
  dayEndsAt: number;
  fluidGoalMl: number;
  macroPlan: MacroPlan;
  /**
   * Earlier versions of the plan fields, so past days are judged by the goal they had. A change
   * applies from the day it's made; "" is the plan before the first change.
   */
  planHistory?: { from: string; plan: Plan }[];
  onboarded: boolean;
}

export type MacroPreset = "balanced" | "high-protein" | "low-carb" | "keto" | "low-fat";

/** Protein is per kg; one of fat or carbs is a share of calories and the other takes the rest. */
export interface MacroPlan {
  preset: MacroPreset;
  proteinPerKg: number;
  fatPct?: number;
  carbPct?: number;
}

export const macroPresets: Record<MacroPreset, { label: string; plan: MacroPlan }> = {
  balanced: { label: "Balanced", plan: { preset: "balanced", proteinPerKg: 1.6, fatPct: 0.3 } },
  "high-protein": { label: "High protein", plan: { preset: "high-protein", proteinPerKg: 2, fatPct: 0.25 } },
  "low-carb": { label: "Low carb", plan: { preset: "low-carb", proteinPerKg: 1.6, carbPct: 0.2 } },
  keto: { label: "Keto", plan: { preset: "keto", proteinPerKg: 1.6, carbPct: 0.05 } },
  "low-fat": { label: "Low fat", plan: { preset: "low-fat", proteinPerKg: 1.6, fatPct: 0.2 } },
};

/** The fields that define a day's budget; changing them shouldn't rewrite how past days look. */
export type Plan = Pick<Profile, "goal" | "metabolismMultiplier" | "calibratedFrom" | "fluidGoalMl" | "macroPlan">;

/** Dash only supports losing or holding weight; 0 is maintain. */
export interface Goal {
  kgPerWeek: number;
  targetKg?: number;
}

const defaults: Profile = { units: "metric", metabolismMultiplier: 1.2, goal: { kgPerWeek: 0.5 }, dayEndsAt: 0, fluidGoalMl: 2000, macroPlan: macroPresets.balanced.plan, onboarded: false };

let profile: Profile = load();
const listeners = new Set<() => void>();

function load(): Profile {
  const stored = { ...defaults, ...read<Partial<Profile>>(KEY, {}) };
  // Versions saved before saving became explicit could repeat the same plan.
  const history = stored.planHistory?.filter((h, i, all) => i === 0 || JSON.stringify(h.plan) !== JSON.stringify(all[i - 1].plan));
  return { ...stored, planHistory: history && history.length > 1 ? history : undefined };
}

export const currentProfile = () => profile;

export function updateProfile(patch: Partial<Profile>) {
  profile = { ...profile, ...patch };
  write(KEY, profile);
  listeners.forEach((l) => l());
}

export function useProfile() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => profile,
  );
}

/** WHO's adult BMI bands start here; below it growth charts apply and height may still change. */
export const ADULT_AGE = 18;

export function ageOn(birthday: string, date: Date = new Date()) {
  const [y, m, d] = birthday.split("-").map(Number);
  const hadBirthday = date.getMonth() + 1 > m || (date.getMonth() + 1 === m && date.getDate() >= d);
  return date.getFullYear() - y - (hadBirthday ? 0 : 1);
}

/** The birth year follows from the age and whether this year's birthday has passed. */
export function birthdayFrom(age: number, month: number, day: number, today: Date = new Date()) {
  const hadBirthday = today.getMonth() + 1 > month || (today.getMonth() + 1 === month && today.getDate() >= day);
  const year = today.getFullYear() - age - (hadBirthday ? 0 : 1);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
