import { dailyTargets, type DailyTargets, type DayTotals, dayTotals, daysBetween, shiftDate, weeksBetween } from "@dash/core";
import { useEntriesBetween } from "../../queries/entries.queries";
import { useFoodLookup } from "../../queries/foods.queries";
import { useMe } from "../../queries/me.queries";
import { useWeighIns } from "../../queries/weighIns.queries";
import { todayKey } from "../time";

export type GoalDay = { date: string; totals: DayTotals | undefined; targets: DailyTargets };
export type Grouping = "day" | "week";

/**
 * A bar's worth of days. `counted` are the ones its averages use: finished days with something
 * logged, or today's so far when that's all there is.
 */
export type Bucket = { from: string; to: string; days: GoalDay[]; counted: GoalDay[]; hasToday: boolean };

/** Each day from `from` to `to`: what was logged, and the targets in effect on it. */
export function useGoalDays(from: string, to: string) {
  const { profile, plan } = useMe();
  const weighIns = useWeighIns();
  const foods = useFoodLookup();
  const entries = useEntriesBetween(from, to).data ?? [];
  const days: GoalDay[] = Array.from({ length: daysBetween(from, to) + 1 }, (_, i) => {
    const date = shiftDate(from, i);
    const ofDay = entries.filter((e) => e.when.date === date);
    return { date, totals: ofDay.length ? dayTotals(ofDay, foods) : undefined, targets: dailyTargets(profile, plan, weighIns, date) };
  });
  return days;
}

/** The Goals overview's window: this week up to today. */
export function useLastWeek() {
  const today = todayKey();
  const days = useGoalDays(shiftDate(today, -6), today);
  return { days, today, buckets: bucketsOf(days, "day", today) };
}

export function bucketsOf(days: GoalDay[], by: Grouping, today: string): Bucket[] {
  if (!days.length) return [];
  const spans = by === "day" ? days.map((d) => ({ from: d.date, to: d.date })) : weeksBetween(days[0]!.date, days.at(-1)!.date);
  return spans.map((span) => {
    const inSpan = days.filter((d) => d.date >= span.from && d.date <= span.to);
    const logged = inSpan.filter((d) => d.totals);
    const finished = logged.filter((d) => d.date < today);
    return { ...span, days: inSpan, counted: finished.length ? finished : logged, hasToday: span.from <= today && today <= span.to };
  });
}

/** A value averaged over days; nothing to average is 0. */
export const averageOf = (days: GoalDay[], value: (d: GoalDay) => number) => (days.length ? days.reduce((sum, d) => sum + value(d), 0) / days.length : 0);

/** The overview's charts are short; a full-page chart gets the room. */
export const chartFrame = (tall?: boolean) => {
  const height = tall ? 260 : 170;
  return { width: 340, height, left: 34, right: 332, top: 8, bottom: height - 20 };
};
const chart = chartFrame();

/** Flat across each bar's slot, stepping where the value changes, so a steady target reads as one line. */
export const stepPath = (values: number[], slot: number, y: (v: number) => number) =>
  values.flatMap((v, i) => [`${i === 0 ? "M" : "L"}${chart.left + i * slot},${y(v)}`, `L${chart.left + (i + 1) * slot},${y(v)}`]).join(" ");

const MAX_LABELS = 7;

/**
 * Under each bar while they fit: weekday and date for a week of days, otherwise the date (a week's
 * Monday). With more bars, every few, counted back from the newest so it's always labelled; when
 * bars are narrower than a label, the newest ends at the frame's edge instead of spilling past it.
 */
export function bucketLabels(buckets: Bucket[], by: Grouping, slot: number) {
  const every = Math.ceil(buckets.length / MAX_LABELS);
  const format: Intl.DateTimeFormatOptions = by === "day" && buckets.length <= MAX_LABELS ? { weekday: "short", day: "numeric" } : { day: "numeric", month: "short" };
  return buckets.map((b, i) => {
    if ((buckets.length - 1 - i) % every !== 0) return undefined;
    const text = new Date(`${b.from}T12:00:00`).toLocaleDateString(undefined, format);
    const atEdge = i === buckets.length - 1 && slot < 40;
    return { text, x: atEdge ? chart.right : chart.left + (i + 0.5) * slot, anchor: atEdge ? ("end" as const) : ("middle" as const) };
  });
}
