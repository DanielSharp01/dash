import { dailyTargets, type DailyTargets, type DayTotals, dayTotals, shiftDate } from "@dash/core";
import { useEntriesBetween } from "../../queries/entries.queries";
import { useFoodLookup } from "../../queries/foods.queries";
import { useMe } from "../../queries/me.queries";
import { useWeighIns } from "../../queries/weighIns.queries";
import { todayKey } from "../time";

/** The overview charts' window; the full chart will offer others. */
const CHART_DAYS = 7;

export type GoalDay = { date: string; totals: DayTotals | undefined; targets: DailyTargets };

/** The last week up to today: what was logged each day, and the targets in effect on it. */
export function useGoalDays() {
  const { profile, plan } = useMe();
  const weighIns = useWeighIns();
  const foods = useFoodLookup();
  const today = todayKey();
  const from = shiftDate(today, -(CHART_DAYS - 1));
  const entries = useEntriesBetween(from, today).data ?? [];
  const days: GoalDay[] = Array.from({ length: CHART_DAYS }, (_, i) => {
    const date = shiftDate(from, i);
    const ofDay = entries.filter((e) => e.when.date === date);
    return { date, totals: ofDay.length ? dayTotals(ofDay, foods) : undefined, targets: dailyTargets(profile, plan, weighIns, date) };
  });
  // Today isn't over, so averages only count finished days with something logged.
  const finished = days.filter((d) => d.date < today && d.totals);
  return { days, today, finished };
}

export const chart = { width: 340, height: 170, left: 34, right: 332, top: 8, bottom: 150 };

/** Flat across each day's slot, stepping where the value changes, so a steady target reads as one line. */
export const stepPath = (values: number[], slot: number, y: (v: number) => number) =>
  values.flatMap((v, i) => [`${i === 0 ? "M" : "L"}${chart.left + i * slot},${y(v)}`, `L${chart.left + (i + 1) * slot},${y(v)}`]).join(" ");

export const dayTick = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric" });
