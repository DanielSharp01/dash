import type { DayPart, When } from "./schemas";

const pad = (n: number) => String(n).padStart(2, "0");

export const toDateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const shiftDate = (key: string, days: number) => {
  const d = new Date(`${key}T12:00:00`);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
};

/** Before the rollover hour the clock is still on the previous day. */
export const logicalDate = (d: Date, dayEndsAt: number) => {
  const shifted = new Date(d);
  if (d.getHours() < dayEndsAt) shifted.setDate(shifted.getDate() - 1);
  return toDateKey(shifted);
};

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
