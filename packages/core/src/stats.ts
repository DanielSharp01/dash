import { daysBetween } from "./time";

const mean = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;

/** The mean and the standard deviation around it; nothing to summarise gives undefined. */
export function meanAndSpread(values: number[]): { mean: number; spread: number } | undefined {
  if (!values.length) return undefined;
  const m = mean(values);
  return { mean: m, spread: Math.sqrt(mean(values.map((v) => (v - m) ** 2))) };
}

/**
 * The straight line through dated weights by least squares: its slope as a change per week, and how
 * far the weights scatter around it (the standard deviation of what the line leaves). Needs at least
 * two different days.
 */
export function weeklyTrend(points: { date: string; kg: number }[]): { perWeek: number; scatter: number } | undefined {
  if (points.length < 2) return undefined;
  const xs = points.map((p) => daysBetween(points[0]!.date, p.date));
  const ys = points.map((p) => p.kg);
  const mx = mean(xs);
  const my = mean(ys);
  const sxx = xs.reduce((sum, x) => sum + (x - mx) ** 2, 0);
  if (sxx === 0) return undefined;
  const slope = xs.reduce((sum, x, i) => sum + (x - mx) * (ys[i]! - my), 0) / sxx;
  const left = ys.map((y, i) => y - (my + slope * (xs[i]! - mx)));
  return { perWeek: slope * 7, scatter: Math.sqrt(mean(left.map((r) => r ** 2))) };
}
