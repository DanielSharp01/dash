import type { DayPart, When } from "./schemas";

const pad = (n: number) => String(n).padStart(2, "0");

export const toDateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const shiftDate = (key: string, days: number) => {
  const d = new Date(`${key}T12:00:00`);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
};

/** Whole days from one date key to another; negative when `to` is earlier. */
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);

/** The Monday-to-Sunday weeks covering `from` to `to`, the first and last cut to the range. */
export function weeksBetween(from: string, to: string): { from: string; to: string }[] {
  const weeks: { from: string; to: string }[] = [];
  for (let start = from; start <= to; ) {
    const sinceMonday = (new Date(`${start}T12:00:00Z`).getUTCDay() + 6) % 7;
    const sunday = shiftDate(start, 6 - sinceMonday);
    weeks.push({ from: start, to: sunday < to ? sunday : to });
    start = shiftDate(sunday, 1);
  }
  return weeks;
}

/** Before the rollover hour the clock is still on the previous day. */
export const logicalDate = (d: Date, dayEndsAt: number) => {
  const shifted = new Date(d);
  if (d.getHours() < dayEndsAt) shifted.setDate(shifted.getDate() - 1);
  return toDateKey(shifted);
};

/** `logicalDate` on the person's wall clock, for code that doesn't run in their time zone. */
export function logicalDateIn(now: Date, timeZone: string, dayEndsAt: number) {
  const format = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" });
  const part = Object.fromEntries(format.formatToParts(now).map((p) => [p.type, p.value]));
  const date = `${part.year}-${part.month}-${part.day}`;
  return Number(part.hour) < dayEndsAt ? shiftDate(date, -1) : date;
}

export const partOfTime = (time: string, dayEndsAt: number): DayPart => {
  const h = Number(time.slice(0, 2));
  if (h < dayEndsAt) return "night";
  if (h >= 4 && h < 7) return "dawn";
  if (h >= 7 && h < 12) return "morning";
  if (h >= 12 && h < 17) return "afternoon";
  if (h >= 17 && h < 21) return "evening";
  return "night";
};

/** Orders entries within and across days. Depends on the rollover hour, so it is computed, never stored. */
export function sortKey(w: When, dayEndsAt: number) {
  const order: Record<DayPart, string> = { dawn: "05:30", morning: "09:30", afternoon: "14:30", evening: "19:00", night: "22:30" };
  if (w.kind === "part") return `${w.date} ${order[w.part]}`;
  if (w.kind === "day") return `${w.date} 99`;
  // Past midnight but before the rollover, the time belongs at the end of its day.
  const h = Number(w.time.slice(0, 2));
  return `${w.date} ${h < dayEndsAt ? `${h + 24}${w.time.slice(2)}` : w.time}`;
}
