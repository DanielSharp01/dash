import { currentProfile } from "./profile";
import type { DayPart, When } from "./types";

export const dayParts: { part: DayPart; label: string; range: string; icon: string }[] = [
  { part: "dawn", label: "Early morning", range: "4–7", icon: "🌅" },
  { part: "morning", label: "Morning", range: "7–12", icon: "☀️" },
  { part: "afternoon", label: "Afternoon", range: "12–17", icon: "🌤️" },
  { part: "evening", label: "Evening", range: "17–21", icon: "🌇" },
  { part: "night", label: "Night", range: "21–4", icon: "🌙" },
];

const pad = (n: number) => String(n).padStart(2, "0");

export const toDateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const dayEndsAt = () => currentProfile().dayEndsAt;

/** Before the rollover hour the clock is still on the previous day. */
const logicalDate = (d: Date) => {
  const shifted = new Date(d);
  if (d.getHours() < dayEndsAt()) shifted.setDate(shifted.getDate() - 1);
  return toDateKey(shifted);
};

export const todayKey = () => logicalDate(new Date());

export const shiftDate = (key: string, days: number) => {
  const d = new Date(`${key}T12:00:00`);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
};

export const nowWhen = (): When => {
  const d = new Date();
  return { date: logicalDate(d), kind: "now", time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
};

/** Today defaults to now; a past day has no sensible default time, so it starts as unknown. */
export const initialWhen = (date: string): When => (date === todayKey() ? nowWhen() : { date, kind: "day" });

export const partOfTime =(time: string): DayPart => {
  const h = Number(time.slice(0, 2));
  if (h < dayEndsAt()) return "night";
  if (h >= 4 && h < 7) return "dawn";
  if (h >= 7 && h < 12) return "morning";
  if (h >= 12 && h < 17) return "afternoon";
  if (h >= 17 && h < 21) return "evening";
  return "night";
};

export const partOf = (w: When): DayPart | undefined =>
  w.kind === "part" ? w.part : w.kind === "day" ? undefined : partOfTime(w.time);

export function dayLabel(key: string) {
  const today = todayKey();
  if (key === today) return "Today";
  if (key === shiftDate(today, -1)) return "Yesterday";
  const d = new Date(`${key}T12:00:00`);
  const sameWeek = key > shiftDate(today, -7);
  return d.toLocaleDateString(undefined, sameWeek ? { weekday: "long" } : { day: "numeric", month: "short" });
}

/** The header always names the weekday, in the title or, for Today/Yesterday, in the subtitle. */
export function dayHeading(key: string) {
  const d = new Date(`${key}T12:00:00`);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  const date = d.toLocaleDateString(undefined, { day: "numeric", month: "long", ...(sameYear ? {} : { year: "numeric" }) });
  const weekday = d.toLocaleDateString(undefined, { weekday: "long" });
  const relative = dayLabel(key);
  return relative === "Today" || relative === "Yesterday" ? { title: relative, subtitle: `${weekday}, ${date}` } : { title: weekday, subtitle: date };
}

/**
 * "Now" is only true while logging; a saved entry, or one reopened later, shows its time.
 * Within a few minutes it still reads as now, so the chip doesn't flip while you type.
 */
function isLiveNow(w: When) {
  if (w.kind !== "now" || w.date !== todayKey()) return false;
  const d = new Date();
  const [h, m] = w.time.split(":").map(Number);
  const diff = d.getHours() * 60 + d.getMinutes() - (h * 60 + m);
  return Math.abs(diff) <= 5 || Math.abs(diff) >= 24 * 60 - 5;
}

export function whenLabel(w: When, withDay = true, live = false) {
  const day = withDay ? dayLabel(w.date) : "";
  const join = (a: string, b: string) => (a ? `${a}, ${b}` : b);
  switch (w.kind) {
    case "now":
      return live && isLiveNow(w) ? "Now" : join(day, w.time);
    case "exact":
      return join(day, w.time);
    case "part":
      return join(day, dayParts.find((p) => p.part === w.part)!.label);
    case "day":
      return join(withDay ? day : "", "Not sure");
  }
}

/** An exact time borrows the icon of the part of day it falls in. */
export function whenIcon(w: When, live = false) {
  if (w.kind === "now" && live && isLiveNow(w)) return "⚡";
  if (w.kind === "day") return "🤷";
  const part = w.kind === "part" ? w.part : partOfTime(w.time);
  return dayParts.find((p) => p.part === part)!.icon;
}

export function sortKey(w: When) {
  const order: Record<DayPart, string> = { dawn: "05:30", morning: "09:30", afternoon: "14:30", evening: "19:00", night: "22:30" };
  if (w.kind === "part") return `${w.date} ${order[w.part]}`;
  if (w.kind === "day") return `${w.date} 99`;
  // Past midnight but before the rollover, the time belongs at the end of its day.
  const h = Number(w.time.slice(0, 2));
  return `${w.date} ${h < dayEndsAt() ? `${h + 24}${w.time.slice(2)}` : w.time}`;
}
