import { durationMinutes } from "./burn";
import type { FoodLookup } from "./foods";
import type { DailyTargets } from "./goals";
import { dayTotals } from "./nutrition";
import type { DayRecap, DayResult, Entry, RecapTone } from "./schemas";
import { shiftDate } from "./time";

/** Under half the budget is more likely a forgotten meal than a great day, so it isn't celebrated. */
const LIGHT_SHARE = 0.5;
/** The smallest overshoot that counts as a close call, for when maintenance is at or near the budget. */
const CLOSE_CALL_SHARE = 1.1;
/** How far back streaks look; a longer run is still counted, just capped here. */
export const RECAP_WINDOW_DAYS = 120;

/**
 * Over the budget but still in a deficit is a close call; eating past maintenance is a big day.
 * A budget at or near maintenance (no weight goal) still leaves a slight overshoot amber.
 */
export function bigDayLine(targets: DailyTargets, burned: number) {
  const slightlyOver = (targets.kcal + burned) * CLOSE_CALL_SHARE;
  const maintenance = targets.calc?.maintenance ?? targets.estimatedMaintenance;
  return maintenance === undefined ? slightlyOver : Math.max(maintenance + burned, slightlyOver);
}

export function dayResult(date: string, entries: Entry[], targets: DailyTargets, foods: FoodLookup): DayResult {
  const t = dayTotals(entries, foods);
  const budget = targets.kcal + t.burned;
  const eaten = t.kcal.value;
  const logged = entries.length > 0;
  const tone: RecapTone = !logged
    ? "empty"
    : eaten < budget * LIGHT_SHARE
      ? "light"
      : eaten <= budget
        ? "great"
        : eaten <= bigDayLine(targets, t.burned)
          ? "close"
          : "over";
  // A clamped target leaves less than the planned deficit, so the goal is what the target allows.
  const goalDeficit = targets.calc ? targets.calc.maintenance - targets.kcal : undefined;
  const workouts = entries.flatMap((e) => (e.kind === "exercise" && e.kcal ? [durationMinutes(e.measures)] : []));
  const exerciseMinutes = workouts.length && workouts.every((m) => m !== undefined) ? workouts.reduce((a: number, m) => a + m!, 0) : undefined;
  return {
    date,
    logged,
    tone,
    eaten,
    budget,
    burned: t.burned,
    missing: t.kcal.missing,
    ...(exerciseMinutes !== undefined ? { exerciseMinutes } : {}),
    ...(goalDeficit !== undefined ? { goalDeficit, deficit: budget + goalDeficit - eaten } : {}),
  };
}

export const weekStart = (date: string) => shiftDate(date, -((new Date(`${date}T12:00:00`).getDay() + 6) % 7));

/** `entries` should cover RECAP_WINDOW_DAYS before `date`; anything outside it is ignored. */
export function dayRecap(date: string, entries: Entry[], targetsOn: (date: string) => DailyTargets, foods: FoodLookup): DayRecap {
  const byDate = new Map<string, Entry[]>();
  for (const e of entries) if (!e.deleted) byDate.set(e.when.date, [...(byDate.get(e.when.date) ?? []), e]);
  const results = new Map<string, DayResult>();
  const resultOn = (d: string) => {
    let r = results.get(d);
    if (!r) results.set(d, (r = dayResult(d, byDate.get(d) ?? [], targetsOn(d), foods)));
    return r;
  };

  const oldest = shiftDate(date, -RECAP_WINDOW_DAYS);
  const runEndingOn = (end: string, counts: (r: DayResult) => boolean) => {
    let n = 0;
    for (let d = end; d > oldest && counts(resultOn(d)); d = shiftDate(d, -1)) n++;
    return n;
  };
  const isLogged = (d: string) => byDate.has(d);

  let best = 0;
  let run = 0;
  for (let d = shiftDate(oldest, 1); d <= date; d = shiftDate(d, 1)) {
    run = isLogged(d) ? run + 1 : 0;
    best = Math.max(best, run);
  }

  const before = shiftDate(date, -1);
  const day = resultOn(date);
  const from = weekStart(date);
  const days: DayResult[] = [];
  for (let d = from; d <= date; d = shiftDate(d, 1)) days.push(resultOn(d));
  const logged = days.filter((d) => d.logged);
  const sum = (xs: (number | undefined)[]) => (xs.every((x) => x !== undefined) ? xs.reduce((a: number, b) => a + b!, 0) : undefined);
  const weekDeficit = logged.length ? sum(logged.map((d) => d.deficit)) : undefined;

  return {
    day,
    first: day.logged && ![...byDate.keys()].some((d) => d < date && d > oldest),
    streak: {
      logged: runEndingOn(date, (r) => r.logged),
      onTarget: runEndingOn(date, (r) => r.tone === "great"),
      loggedBefore: runEndingOn(before, (r) => r.logged),
      onTargetBefore: runEndingOn(before, (r) => r.tone === "great"),
      best,
    },
    week: {
      from,
      days,
      complete: days.length === 7,
      // Days with nothing logged aren't known to be at maintenance, so they don't count either way.
      ...(weekDeficit !== undefined ? { deficit: weekDeficit } : {}),
      ...(day.goalDeficit !== undefined ? { goal: day.goalDeficit * 7 } : {}),
    },
  };
}

/** The finished day whose recap should play on its own: yesterday, unless it was already seen. */
export function pendingRecapDay(today: string, seenFor: string | undefined) {
  const yesterday = shiftDate(today, -1);
  return !seenFor || seenFor < yesterday ? yesterday : undefined;
}

/** A day with nothing logged only gets a recap when it ended a run; after a long gap it would just nag. */
export const recapWorthShowing = (r: DayRecap) => r.day.logged || r.streak.loggedBefore > 0;
