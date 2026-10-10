import type { Plan } from "@dash/core";

/** WHO's adult BMI bands start here; below it growth charts apply and height may still change. */
export const ADULT_AGE = 18;

/** The birth year follows from the age and whether this year's birthday has passed. */
export function birthdayFrom(age: number, month: number, day: number, today: Date = new Date()) {
  const hadBirthday = today.getMonth() + 1 > month || (today.getMonth() + 1 === month && today.getDate() >= day);
  const year = today.getFullYear() - age - (hadBirthday ? 0 : 1);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** When the target weight is reached at the chosen pace, if both are set and it's below today's weight. */
export function targetDate(currentKg: number, goal: Plan["goal"]) {
  if (!goal.targetKg || goal.kgPerWeek <= 0 || goal.targetKg >= currentKg) return undefined;
  const weeks = (currentKg - goal.targetKg) / goal.kgPerWeek;
  return new Date(Date.now() + weeks * 7 * 86_400_000);
}
