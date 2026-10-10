import { logicalDate, partOfTime as corePartOfTime, shiftDate, sortKey as coreSortKey, type DayPart, type MeResponse, type When } from "@dash/core";
import { queryClient } from "../queries/client";
import { keys } from "../queries/keys";

export const dayParts: { part: DayPart; label: string; from: number; to: number; icon: string }[] = [
  { part: "dawn", label: "Early morning", from: 4, to: 7, icon: "🌅" },
  { part: "morning", label: "Morning", from: 7, to: 12, icon: "☀️" },
  { part: "afternoon", label: "Afternoon", from: 12, to: 17, icon: "🌤️" },
  { part: "evening", label: "Evening", from: 17, to: 21, icon: "🌇" },
  { part: "night", label: "Night", from: 21, to: 4, icon: "🌙" },
];

export const pad = (n: number) => String(n).padStart(2, "0");

/** The app only renders once /me is loaded, so the person's settings are always there. */
const profile = () => queryClient.getQueryData<MeResponse>(keys.me)?.profile;
const dayEndsAt = () => profile()?.dayEndsAt ?? 0;
export const uses12h = () => profile()?.clock === "12h";

const hour12 = (h: number) => h % 12 || 12;
const meridiem = (h: number) => (h < 12 ? "am" : "pm");

/** "16:05", or "4:05 pm" on a 12-hour clock. */
export function formatTime(time: string) {
  if (!uses12h()) return time;
  const [h, m] = time.split(":").map(Number) as [number, number];
  return `${hour12(h)}:${pad(m)} ${meridiem(h)}`;
}

/** A whole hour: "4:00", or "4am" on a 12-hour clock. */
export const formatHour = (h: number) => (uses12h() ? `${hour12(h)}${meridiem(h)}` : `${h}:00`);

/** "17–21", or "5–9pm"; the first am/pm is only written when it differs from the second. */
export function hourRange(from: number, to: number) {
  if (!uses12h()) return `${from}–${to}`;
  const start = meridiem(from) === meridiem(to) ? `${hour12(from)}` : formatHour(from);
  return `${start}–${formatHour(to)}`;
}

export const todayKey = () => logicalDate(new Date(), dayEndsAt());

export const nowWhen = (): When => {
  const d = new Date();
  return { date: logicalDate(d, dayEndsAt()), kind: "now", time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
};

/** Today defaults to now; a past day has no sensible default time, so it starts as unknown. */
export const initialWhen = (date: string): When => (date === todayKey() ? nowWhen() : { date, kind: "day" });

export const partOfTime = (time: string) => corePartOfTime(time, dayEndsAt());

export const partOf = (w: When): DayPart | undefined => (w.kind === "part" ? w.part : w.kind === "day" ? undefined : partOfTime(w.time));

export const sortKey = (w: When) => coreSortKey(w, dayEndsAt());

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
  const [h, m] = w.time.split(":").map(Number) as [number, number];
  const diff = d.getHours() * 60 + d.getMinutes() - (h * 60 + m);
  return Math.abs(diff) <= 5 || Math.abs(diff) >= 24 * 60 - 5;
}

export function whenLabel(w: When, withDay = true, live = false) {
  const day = withDay ? dayLabel(w.date) : "";
  const join = (a: string, b: string) => (a ? `${a}, ${b}` : b);
  switch (w.kind) {
    case "now":
      return live && isLiveNow(w) ? "Now" : join(day, formatTime(w.time));
    case "exact":
      return join(day, formatTime(w.time));
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

/** Moving a capture to another day keeps its time of day; "now" only means now on today. */
export function withDate(w: When, date: string): When {
  if (w.kind === "now" || w.kind === "exact") return date === todayKey() && w.kind === "now" ? w : { date, kind: "exact", time: w.time };
  return { ...w, date };
}

export const dayMs = (key: string) => new Date(`${key}T12:00:00`).getTime();

/** "?day=" for a past day; today needs none. */
export const dayParam = (date: string) => (date === todayKey() ? "" : `?day=${date}`);
