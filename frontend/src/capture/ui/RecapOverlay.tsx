import { type CSSProperties, type MouseEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { type DayRecap, type DayResult, KCAL_PER_KG, type MacroCall, macroCalls, type RecapTone, shiftDate } from "@dash/core";

const fmt = (n: number) => Math.round(n).toLocaleString();
const kg = (kcal: number) => (Math.abs(kcal) / KCAL_PER_KG).toFixed(2);
const weekday = (date: string, style: "long" | "short" = "long") => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: style });
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const ADVANCE_MS = 5500;
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

const dayEmoji: Record<RecapTone, string> = { great: "🎉", close: "😅", over: "🍕", light: "🤔", empty: "🫥" };
const dotEmoji: Record<RecapTone, string> = { great: "✅", close: "😅", over: "🍕", light: "🤔", empty: "·" };
const headline: Record<RecapTone, string> = { great: "Nailed it", close: "So close", over: "Big day", light: "Looks light", empty: "No logs" };

/** The short form for the strip in the day's summary. */
export const stripLabel: Record<RecapTone, string> = { great: "On target", close: "Close call", over: "Big day", light: "Looks light", empty: "Nothing logged" };
export const stripEmoji = dayEmoji;

interface Card {
  key: string;
  tone: RecapTone;
  /** Waits for a choice instead of moving on by itself. */
  asks?: boolean;
  label: string;
  /** `settled` shows the card finished: it played before, so coming back doesn't replay it. */
  body: (active: boolean, settled: boolean) => ReactNode;
}

export interface RecapActions {
  /** Shows the day the last card's button names, behind the recap as it closes. */
  onContinue: (date: string) => void;
  onFill: (date: string) => void;
  onFollowUp: () => void;
}

export function RecapOverlay({ recap, intro, preview, onClose, actions }: { recap: DayRecap; intro: boolean; preview: boolean; onClose: () => void; actions: RecapActions }) {
  const reduced = useMemo(reducedMotion, []);
  const cards = recapCards(recap, preview, actions);
  const [stage, setStage] = useState<"intro" | "cards">(intro && !reduced ? "intro" : "cards");
  const [flipped, setFlipped] = useState(false);
  const [current, setCurrent] = useState(-1);
  const [played, setPlayed] = useState<number[]>([]);
  const [replaying, setReplaying] = useState(false);
  // Moving by hand ends auto-advance; from then on only taps change the card.
  const [manual, setManual] = useState(false);
  const [leaving, setLeaving] = useState<CSSProperties | undefined>();
  const cardRefs = useRef<(HTMLElement | null)[]>([]);

  /** A card skipped over hasn't played, so it still animates the first time it's shown. */
  const show = (i: number) => {
    setReplaying(played.includes(i));
    setPlayed((p) => (p.includes(i) ? p : [...p, i]));
    setCurrent(i);
  };

  const go = (i: number) => {
    if (stage !== "cards" || current < 0 || i === current || i < 0 || i >= cards.length) return;
    setManual(true);
    show(i);
  };

  useEffect(() => {
    if (stage === "intro") {
      const timers = [setTimeout(() => setFlipped(true), 500), setTimeout(() => setStage("cards"), 2300)];
      return () => timers.forEach(clearTimeout);
    }
    // One frame at rest first, so the card rises and its ring fills instead of appearing done.
    const frame = requestAnimationFrame(() => show(0));
    return () => cancelAnimationFrame(frame);
  }, [stage]);

  const card = cards[current];
  const last = current === cards.length - 1;
  // The last card's bar fills like the others; there's just nothing to move on to when it's full.
  const timing = !!card && !card.asks && !manual && !leaving;
  const advancing = timing && !last;
  useEffect(() => {
    if (!advancing) return;
    const t = setTimeout(() => show(current + 1), ADVANCE_MS);
    return () => clearTimeout(t);
  }, [current, advancing]);

  const close = () => {
    if (leaving) return;
    const el = cardRefs.current[current];
    const strip = document.querySelector<HTMLElement>("[data-recap-strip]");
    if (!el || !strip || reduced) return onClose();
    // The card folds into the summary's strip, which is where the recap can be replayed from.
    const a = el.getBoundingClientRect();
    const b = strip.getBoundingClientRect();
    setLeaving({ transformOrigin: "0 0", transform: `translate(${b.left - a.left}px, ${b.top - a.top}px) scale(${b.width / a.width}, ${b.height / a.height})` });
    setTimeout(() => {
      strip.classList.remove("recap-strip-flash");
      void strip.offsetWidth;
      strip.classList.add("recap-strip-flash");
      onClose();
    }, 520);
  };

  const finish = () => {
    if (preview) return close();
    actions.onContinue(shiftDate(recap.day.date, 1));
    // After the new day renders, so the card folds into that day's strip.
    setTimeout(close, 50);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") go(current + 1);
      if (e.key === "ArrowLeft") go(current - 1);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  });

  /** Only the buttons finish the recap; a stray tap or arrow on the last card stays put. */
  const tap = (e: MouseEvent<HTMLElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest("[data-recap-next]")) return last ? finish() : go(current + 1);
    if (target.closest("button")) return;
    const box = e.currentTarget.getBoundingClientRect();
    go(current + (e.clientX - box.left < box.width / 3 ? -1 : 1));
  };

  const next = shiftDate(recap.day.date, 1);
  return (
    <div className={`recap${leaving ? " recap-leaving" : ""}`} role="dialog" aria-modal aria-label={`${weekday(recap.day.date)} recap`}>
      <div className="recap-progress">
        {cards.map((c, i) => (
          <button key={c.key} onClick={() => go(i)} aria-label={c.label || `Card ${i + 1}`} aria-current={i === current ? "step" : undefined}>
            <i>
              <b className={i === current && timing ? "running" : i <= current ? "done" : ""} />
            </i>
          </button>
        ))}
      </div>
      <div className="recap-top">
        <span>{preview ? "Preview · the day isn't over" : (card?.label ?? `${weekday(recap.day.date)}, wrapped`)}</span>
        <button className="recap-close" onClick={close} aria-label="Close">
          ✕
        </button>
      </div>
      <div className="recap-cards">
        {cards.map((c, i) => (
          <article
            key={c.key}
            ref={(el) => {
              cardRefs.current[i] = el;
            }}
            className={`recap-card recap-tone-${c.tone} ${i === current ? "in" : i < current ? "past" : "future"}${i === current && replaying ? " settled" : ""}${i === current && leaving ? " folding" : ""}`}
            style={i === current ? leaving : undefined}
            onClick={tap}
          >
            {c.body(i === current, i === current && replaying)}
          </article>
        ))}
      </div>
      {stage === "intro" && (
        <div className="recap-flip">
          <div className={`recap-cal${flipped ? " flipped" : ""}`}>
            <div className="recap-cal-inner">
              <CalFace date={recap.day.date} />
              <CalFace date={next} back />
            </div>
          </div>
          <p className="recap-flip-caption">New day ☀️ Here's how {weekday(recap.day.date)} went</p>
        </div>
      )}
    </div>
  );
}

function CalFace({ date, back }: { date: string; back?: boolean }) {
  const d = new Date(`${date}T12:00:00`);
  return (
    <div className={`recap-cal-face${back ? " back" : ""}`}>
      <div className="recap-cal-day">{weekday(date, "short").toUpperCase()}</div>
      <div className="recap-cal-num">
        {d.getDate()}
        <small>{d.toLocaleDateString(undefined, { month: "long" })}</small>
      </div>
    </div>
  );
}

function recapCards(recap: DayRecap, preview: boolean, actions: RecapActions): Card[] {
  const { day, streak, week } = recap;
  const name = preview ? "today" : weekday(day.date);
  const cards: Card[] = [{ key: "day", tone: day.tone, asks: day.tone === "light" || day.tone === "empty", label: preview ? "" : `${name}, wrapped`, body: (active, settled) => <DayCard recap={recap} name={name} preview={preview} active={active} settled={settled} actions={actions} /> }];

  const endedTargetRun = day.logged && streak.onTarget === 0 && streak.onTargetBefore >= 2;
  if (day.logged && !recap.first && (streak.logged >= 2 || streak.onTarget >= 2 || endedTargetRun))
    cards.push({ key: "streaks", tone: streak.onTarget > 0 ? "great" : "close", label: "Streaks", body: () => <StreakCard recap={recap} /> });

  const loggedDays = week.days.filter((d) => d.logged).length;
  if (week.deficit !== undefined && (loggedDays >= 2 || week.complete))
    cards.push({ key: "week", tone: weekTone(recap), label: week.complete ? "The week" : "This week", body: () => <WeekCard recap={recap} /> });

  const last = cards[cards.length - 1]!;
  const body = last.body;
  last.body = (active, settled) => (
    <>
      {body(active, settled)}
      {!last.asks && <CloseButton date={day.date} preview={preview} />}
    </>
  );
  return cards;
}

function CloseButton({ date, preview }: { date: string; preview: boolean }) {
  return (
    <div className="recap-actions">
      <button className="recap-btn primary" data-recap-next>
        {preview ? "Close" : `On to ${weekday(shiftDate(date, 1))} →`}
      </button>
    </div>
  );
}

function weekTone({ week }: DayRecap): RecapTone {
  const deficit = week.deficit ?? 0;
  // Paced on the days logged, so a week that started being tracked midway isn't behind from the start.
  const pace = (week.goal ?? 0) * (week.days.filter((d) => d.logged).length / 7);
  return deficit >= pace * 0.7 ? "great" : deficit > 0 ? "close" : "over";
}

function DayCard({ recap, name, preview, active, settled, actions }: { recap: DayRecap; name: string; preview: boolean; active: boolean; settled: boolean; actions: RecapActions }) {
  const { day, streak, week } = recap;
  const Name = name[0]!.toUpperCase() + name.slice(1);
  if (day.tone === "light" || day.tone === "empty") {
    const share = Math.round((day.eaten / day.budget) * 100);
    return (
      <>
        <Hero emoji={dayEmoji[day.tone]} eyebrow={Name} title={day.tone === "empty" ? `No logs ${preview ? "yet" : `on ${Name}`}` : headline.light} />
        <p className="recap-lead">
          {day.tone === "light"
            ? `Only ${fmt(day.eaten)} kcal logged, ${share}% of your budget. Did something slip through?`
            : "It happens. A rough guess from memory still keeps your week honest."}
        </p>
        <div className="recap-stagger">
          {day.tone === "empty" && <Dots recap={recap} />}
          <p className="recap-note plain">
            {day.tone === "light"
              ? "Not counted as a big deficit until you've checked it."
              : streak.loggedBefore > 1
                ? `Your ${streak.loggedBefore}-day logging streak is paused. Log anything today to start a new one 💪`
                : "Log anything today to start a streak 💪"}
          </p>
        </div>
        <div className="recap-actions">
          <button className="recap-btn primary" onClick={() => actions.onFill(day.date)}>
            ✏️ Fill in {Name}
          </button>
          <button className="recap-btn" data-recap-next>
            {day.tone === "light" ? "It's right, move on" : "Skip"}
          </button>
        </div>
      </>
    );
  }

  const over = day.eaten - day.budget;
  const lead =
    day.tone === "great"
      ? over === 0
        ? "Right on budget."
        : `You stayed ${fmt(-over)} kcal under budget.`
      : day.tone === "close"
        ? `${fmt(over)} kcal over budget${(day.deficit ?? 0) > 0 ? ", and that's still a real deficit." : "."}`
        : `${fmt(over)} over budget. One day doesn't undo a week.`;
  const unsure = day.missing > 0;
  return (
    <>
      <Hero emoji={dayEmoji[day.tone]} eyebrow={preview ? "Today so far" : `You logged ${Name}`} title={headline[day.tone]} burst={active && !settled && day.tone === "great"} />
      <p className="recap-lead">{lead}</p>
      <DayRing day={day} unsure={unsure} active={active} settled={settled} />
      <div className="recap-stagger" style={{ "--after": `${revealAt(day) - 300}ms` } as CSSProperties}>
        <DayStats day={day} />
        <MacroNote day={day} />
        {day.burned > 0 && <p className="recap-note good">{exerciseLine(day)}</p>}
        {recap.first && <p className="recap-note good">🌱 Day one logged. Streaks start tomorrow.</p>}
        {!recap.first && day.tone === "over" && (week.deficit ?? 0) > 0 && <p className="recap-note plain">You're still {fmt(week.deficit!)} kcal down this week 👍</p>}
        {unsure && (
          <button className="recap-note warn" onClick={actions.onFollowUp}>
            📥 {plural(day.missing, "thing has", "things have")} no calories yet, so this could be {day.deficit !== undefined ? "smaller" : "off"} ›
          </button>
        )}
      </div>
      {!recap.first && <p className="recap-hint">Tap to continue</p>}
    </>
  );
}

const macroWord: Record<MacroCall["macro"], { heavy: string; short: string }> = {
  protein: { heavy: "protein", short: "protein" },
  carbs: { heavy: "carb", short: "carbs" },
  fat: { heavy: "fat", short: "fat" },
};

function macroClause({ macro, way, strong }: MacroCall) {
  const word = macroWord[macro][way];
  if (way === "heavy") return `was ${strong ? "very" : "slightly"} ${word} heavy`;
  return strong ? `lacked a lot of ${word}` : `was a bit short on ${word}`;
}

function MacroNote({ day }: { day: DayResult }) {
  const calls = macroCalls(day);
  if (!calls) return null;
  if (!calls.length) return <p className="recap-note good">💪 Great job on the macros.</p>;
  const clauses = calls.map(macroClause);
  const joined = clauses.length > 1 ? `${clauses.slice(0, -1).join(", ")} and ${clauses.at(-1)}` : clauses[0];
  const protein = day.macros.protein;
  const proteinShort = calls.some((c) => c.macro === "protein");
  return (
    <p className="recap-note plain">
      🥗 Your day {joined}
      {proteinShort ? (
        <>
          {" "}
          <span className="nowrap">
            ({fmt(protein.eaten)} of {fmt(protein.target)} g).
          </span>
        </>
      ) : (
        "."
      )}
    </p>
  );
}

/** When the ring has filled, lapping included, and the middle switches to the result. */
const revealAt = (day: DayResult) => (day.budget > 0 && day.eaten > day.budget ? 2400 : 1800);

function minutesText(minutes: number) {
  const m = Math.round(minutes);
  if (m < 60) return plural(m, "minute", "minutes");
  return m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : plural(m / 60, "hour", "hours");
}

function exerciseLine(day: DayResult) {
  const extended = `🏃 You extended your budget by ${fmt(day.burned)} kcal with exercise.`;
  if (day.exerciseMinutes === undefined) return extended;
  return (
    <>
      {extended}
      <br />
      {day.exerciseMinutes <= 60 ? "It only took" : "That took"} {minutesText(day.exerciseMinutes)}.
    </>
  );
}

function DayRing({ day, unsure, active, settled }: { day: DayResult; unsure: boolean; active: boolean; settled: boolean }) {
  const surplus = day.deficit !== undefined && day.deficit < 0;
  // Eaten against the budget, read the same way as the ring on the day view; the number says the deficit.
  const share = day.budget > 0 ? day.eaten / day.budget : 0;
  const value = day.deficit === undefined ? Math.abs(day.budget - day.eaten) : Math.abs(day.deficit);
  const unit = day.deficit === undefined ? (day.eaten > day.budget ? "kcal over budget" : "kcal under budget") : surplus ? "kcal surplus" : "kcal deficit";
  // The middle counts what was eaten while the ring fills with it, then turns into the result,
  // so the moving number always matches the moving ring.
  const [result, setResult] = useState(false);
  useEffect(() => {
    if (!active) return setResult(false);
    if (settled || reducedMotion()) return setResult(true);
    const t = setTimeout(() => setResult(true), revealAt(day));
    return () => clearTimeout(t);
  }, [active, settled]);
  return (
    <div className="recap-ring">
      <Arc share={share} active={active} faded={unsure} />
      {result ? (
        <div className="recap-ring-text recap-ring-result">
          <b className="recap-ring-num">
            {surplus ? "+" : unsure ? "≤ " : ""}
            {fmt(value)}
          </b>
          <span>{unit}</span>
        </div>
      ) : (
        <div className="recap-ring-text">
          <CountUp to={day.eaten} prefix={unsure ? "≥ " : ""} active={active} plain />
          <span>kcal eaten</span>
        </div>
      )}
    </div>
  );
}

function DayStats({ day }: { day: DayResult }) {
  if (day.deficit === undefined)
    return (
      <div className="recap-stats">
        <Stat value={fmt(day.eaten)} label="kcal eaten" />
        <Stat value={fmt(day.budget)} label="kcal budget" />
      </div>
    );
  if (day.deficit < 0)
    return (
      <>
        <div className="recap-stats">
          <Stat value={fmt(day.eaten)} label={`eaten, budget ${fmt(day.budget)}`} />
          <Stat value={`+${kg(day.deficit)} kg`} label="of fat, at most" />
        </div>
        {/* The next weigh-in usually jumps far more than the surplus explains, which reads as a disaster. */}
        <p className="recap-note plain">If the scale jumps tomorrow, that's mostly water and food weight, not fat. It settles in a few days.</p>
      </>
    );
  return (
    <>
      <div className="recap-stats">
        <Stat value={`${Math.round((day.deficit / day.goalDeficit!) * 100)}%`} label={`of your ${fmt(day.goalDeficit!)} kcal goal`} />
        <Stat value={`≈ ${kg(day.deficit)} kg`} label="of fat, roughly" />
      </div>
      <p className="recap-note plain">
        Eaten {fmt(day.eaten)} of a {fmt(day.budget)} kcal budget
      </p>
    </>
  );
}

function StreakCard({ recap }: { recap: DayRecap }) {
  const { streak } = recap;
  const onRoll = streak.logged >= 5;
  return (
    <>
      <Hero emoji="🔥" eyebrow="Streaks" title={onRoll ? "On a roll" : "Keep it going"} />
      <div className="recap-stagger">
        <div className="recap-streaks">
          <div className="recap-streak">
            <span className="recap-streak-icon">🔥</span>
            <div>
              <b>{plural(streak.logged, "day", "days")}</b>
              <span>logged in a row{recap.day.tone === "over" ? ". That's the habit that matters" : ""}</span>
            </div>
          </div>
          {streak.onTarget > 0 ? (
            <div className="recap-streak">
              <span className="recap-streak-icon">🎯</span>
              <div>
                <b>{plural(streak.onTarget, "day", "days")}</b>
                <span>on target in a row</span>
              </div>
            </div>
          ) : (
            <div className="recap-streak broken">
              <span className="recap-streak-icon">🎯</span>
              <div>
                <b>Back to 0</b>
                <span>{streak.onTargetBefore >= 2 ? `Your ${streak.onTargetBefore}-day target run ended. Today's a clean slate.` : "Today's a clean slate."}</span>
              </div>
            </div>
          )}
        </div>
        <Dots recap={recap} />
        {streak.best > streak.logged && <p className="recap-note plain">Your best run is {streak.best} days</p>}
      </div>
      <p className="recap-hint">Tap to continue</p>
    </>
  );
}

function WeekCard({ recap }: { recap: DayRecap }) {
  const { week } = recap;
  const deficit = week.deficit!;
  const goal = week.goal;
  const days = weekDays(recap);
  const deficits = week.days.flatMap((d) => (d.logged && d.deficit !== undefined ? [d.deficit] : []));
  const dailyGoal = (goal ?? 0) / 7;
  // Room below the line only for a week that has a surplus day; otherwise it reads as unfinished.
  const above = Math.max(...deficits, dailyGoal) * 1.15 || 1;
  const below = Math.max(0, ...deficits.map((d) => -d)) * 1.15;
  const span = above + below;
  const baseline = (above / span) * 100;
  const share = goal ? Math.max(0, Math.min(deficit / goal, 1)) : 0;
  const good = weekTone(recap) === "great";
  return (
    <>
      <Hero emoji={week.complete ? (good ? "🏆" : "📅") : "📈"} eyebrow={week.complete ? "The week, wrapped" : "This week so far"} title={`${deficit >= 0 ? "−" : "+"}${fmt(Math.abs(deficit))} kcal`} />
      <p className="recap-lead">
        {deficit >= 0
          ? `≈ ${kg(deficit)} kg ${week.complete ? "for the week" : "so far"}${goal ? `, against a goal of ${kg(goal)} kg a week` : ""}.`
          : `≈ ${kg(deficit)} kg over ${week.complete ? "the week" : "so far"}. Plenty of week left to turn it.`}
      </p>
      <div className="recap-stagger">
        <div>
          <div className={`recap-chart${below ? " with-surplus" : ""}`} style={{ "--baseline": `${baseline}%` } as CSSProperties}>
            {dailyGoal > 0 && <span className="recap-chart-goal" style={{ bottom: `${100 - baseline + (dailyGoal / span) * 100}%` }} />}
            {days.map(({ date, result }) => (
              <div key={date} className="recap-bar">
                {result?.logged && result.deficit !== undefined && (
                  <i className={result.deficit >= 0 ? "up" : "down"} style={{ height: `${(Math.abs(result.deficit) / span) * 100}%` }} />
                )}
              </div>
            ))}
          </div>
          <div className="recap-chart-labels">
            {days.map(({ date }) => (
              <span key={date}>{weekday(date, "short")}</span>
            ))}
          </div>
        </div>
        {goal !== undefined && (
          <div className="recap-goal">
            <div className="recap-goal-track">
              <div className="recap-goal-fill" style={{ "--share": share } as CSSProperties} />
            </div>
            <div className="recap-goal-cap">
              <span>{Math.round(share * 100)}% of the weekly goal</span>
              <span>goal {fmt(goal)} kcal</span>
            </div>
          </div>
        )}
        {week.complete && (
          <p className={`recap-note${good ? "" : " plain"}`}>
            {good ? "A great week 🎉" : deficit > 0 ? "Not every week is a record. This one still moved the needle." : "New week tomorrow, fresh start 🌱"}
          </p>
        )}
      </div>
    </>
  );
}

/** Monday to Sunday, with results up to the recapped day. */
const weekDays = ({ week }: DayRecap) =>
  Array.from({ length: 7 }, (_, i) => {
    const date = shiftDate(week.from, i);
    return { date, result: week.days.find((d) => d.date === date) };
  });

function Dots({ recap }: { recap: DayRecap }) {
  const after = shiftDate(recap.day.date, 1);
  return (
    <div className="recap-dots">
      {weekDays(recap).map(({ date, result }) => (
        <div key={date} className="recap-dot">
          <i className={result ? `t-${result.tone}` : date === after ? "t-next" : ""}>{result ? (result.tone === "empty" ? "❔" : dotEmoji[result.tone]) : ""}</i>
          {weekday(date, "short")}
        </div>
      ))}
    </div>
  );
}

function Hero({ emoji, eyebrow, title, burst }: { emoji: string; eyebrow: string; title: string; burst?: boolean }) {
  return (
    <>
      {burst && <Burst />}
      <div className="recap-emoji" aria-hidden>
        {emoji}
      </div>
      <div className="recap-eyebrow">{eyebrow}</div>
      <h2 className="recap-title">{title}</h2>
    </>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="recap-stat">
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

function Arc({ share, active, faded }: { share: number; active: boolean; faded: boolean }) {
  const r = 82;
  const c = 2 * Math.PI * r;
  const first = Math.min(share, 1);
  const lap = Math.max(0, Math.min(share - 1, 1));
  const arc = (len: number, cls: string) => (
    <circle
      className={cls}
      cx="95"
      cy="95"
      r={r}
      fill="none"
      strokeWidth="16"
      strokeLinecap="round"
      strokeDasharray={`${active ? len * c : 0} ${c}`}
      // A zero-length round-capped arc still draws a dot.
      strokeOpacity={active && len > 0 ? (faded ? 0.55 : 1) : 0}
    />
  );
  return (
    <svg width="190" height="190" viewBox="0 0 190 190" aria-hidden>
      <circle cx="95" cy="95" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="16" />
      {arc(first, "recap-arc")}
      {lap > 0 && arc(lap, "recap-arc lap")}
    </svg>
  );
}

function CountUp({ to, prefix, active, plain }: { to: number; prefix: string; active: boolean; plain?: boolean }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!active) return;
    if (reducedMotion()) return setShown(to);
    const start = performance.now() + 350;
    let frame = 0;
    const tick = (now: number) => {
      const p = Math.max(0, Math.min((now - start) / 1100, 1));
      setShown(to * (1 - (1 - p) ** 3));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, to]);
  return (
    <b className={`recap-ring-num${plain ? " plain" : ""}`}>
      {prefix}
      {fmt(shown)}
    </b>
  );
}

const confetti = ["🎉", "✨", "🥳", "⭐", "💚", "🎊"];

function Burst() {
  const bits = useMemo(
    () =>
      Array.from({ length: 26 }, (_, i) => {
        const angle = Math.random() * Math.PI * 2;
        const dist = 90 + Math.random() * 120;
        return {
          emoji: confetti[i % confetti.length],
          style: {
            "--dx": `${Math.cos(angle) * dist}px`,
            "--dy": `${Math.sin(angle) * dist + 60}px`,
            "--rot": `${(Math.random() - 0.5) * 540}deg`,
            animationDelay: `${350 + Math.random() * 150}ms`,
          } as CSSProperties,
        };
      }),
    [],
  );
  if (reducedMotion()) return null;
  return (
    <div className="recap-burst" aria-hidden>
      {bits.map((b, i) => (
        <span key={i} style={b.style}>
          {b.emoji}
        </span>
      ))}
    </div>
  );
}
