import { useState } from "react";
import { asItem, asRecipe, type Contents, dayTotals, displayName, type Entry, entryContents, lineContents, entryNeedsFollowUp, type FoodLookup, formatAmount, formatFluid, type Line, type Part, shiftDate } from "@dash/core";
import { useActivityLookup } from "../../queries/activities.queries";
import { useDayEntries, useFollowUp, useFollowUpCount } from "../../queries/entries.queries";
import { useFoodLookup } from "../../queries/foods.queries";
import { useProfile } from "../../queries/me.queries";
import { batchLabel, cookingNow, useListedFoods } from "../foods";
import { useDailyTargets } from "../targets";
import { dayHeading, dayParam, dayParts, formatTime, partOf, sortKey, todayKey, whenLabel } from "../time";
import { FlowShell } from "../ui/FlowShell";
import { Ring } from "../ui/Ring";
import { TrashIcon } from "../ui/TrashIcon";
import { Breakdown, type BreakdownRow, ingredientRows, kcalText } from "../ui/Breakdown";
import { MiniMacros, macroMeta } from "../ui/MiniMacros";
import { MissingDetails } from "../ui/MissingDetails";
import { useOpen, useSteps } from "../ui/useSteps";

export interface EntryActions {
  onEdit: (e: Entry) => void;
  onDuplicate: (e: Entry) => void;
  onDelete: (e: Entry) => void;
}

const fmt = (n: number) => Math.round(n).toLocaleString();

export function Today({ day, setDay, onMenu, actions }: { day: string; setDay: (d: string) => void; onMenu: () => void; actions: EntryActions }) {
  const { data: entries, isPending } = useDayEntries(day);
  const open = useOpen();
  const targets = useDailyTargets(day);
  const dayQuery = dayParam(day);
  const dayEntries = [...(entries ?? [])].sort((a, b) => sortKey(a.when).localeCompare(sortKey(b.when)));
  const inbox = useFollowUpCount();
  const cooking = cookingNow(useListedFoods());

  return (
    <div className="home">
      <header className="home-header">
        <button className="icon-btn" onClick={onMenu} aria-label="Menu">
          ☰
        </button>
        <button className="icon-btn" onClick={() => setDay(shiftDate(day, -1))} aria-label="Previous day">
          ‹
        </button>
        <div className="day-title">
          <h1>{dayHeading(day).title}</h1>
          <span>{dayHeading(day).subtitle}</span>
        </div>
        <button className="icon-btn" onClick={() => setDay(shiftDate(day, 1))} disabled={day >= todayKey()} aria-label="Next day">
          ›
        </button>
        {day !== todayKey() ? (
          <button className="chip today-btn" onClick={() => setDay(todayKey())}>
            Today
          </button>
        ) : (
          <span className="icon-btn" />
        )}
      </header>

      {(inbox > 0 || cooking.length > 0) && (
        <div className="home-chips">
          {cooking.map((r) => (
            <button key={r.id} className="pill pill-cooking" onClick={() => open(`/cook/${r.id}`)}>
              🔥 Cooking {r.name} ›
            </button>
          ))}
          {inbox > 0 && (
            <button className="pill pill-inbox" onClick={() => open("/follow-up")}>
              📥 {inbox} to follow up ›
            </button>
          )}
        </div>
      )}

      <MissingDetails missing={targets.missing} lead="The budget is a placeholder until Dash knows your" />

      <DaySummary entries={dayEntries} day={day} />
      {isPending ? <p className="empty">Loading…</p> : <Timeline entries={dayEntries} actions={actions} />}

      <nav className="quick-add">
        <button className="qa-btn qa-food" onClick={() => open(`/log/ate${dayQuery}`)}>
          <span>🍽️</span>I ate
        </button>
        <button className="qa-btn qa-drink" onClick={() => open(`/log/drank${dayQuery}`)}>
          <span>🥤</span>I drank
        </button>
        <button className="qa-btn qa-exercise" onClick={() => open(`/log/exercise${dayQuery}`)}>
          <span>🏃</span>I exercised
        </button>
        <button className="qa-btn qa-cook" onClick={() => open("/cook")}>
          <span>🍳</span>I cooked
        </button>
      </nav>
    </div>
  );
}

/** "≥" on what's eaten and "≤" on what's left whenever something logged has no value yet. */
function DaySummary({ entries, day }: { entries: Entry[]; day: string }) {
  const goals = useDailyTargets(day);
  const { units } = useProfile();
  const t = dayTotals(entries, useFoodLookup());
  const budget = goals.kcal + t.burned;
  const left = budget - t.kcal.value;
  const unsure = t.kcal.missing > 0;
  const tone = kcalTone(t.kcal.value, budget);

  return (
    <section className="summary">
      <div className="summary-main">
        <div className="summary-rings">
          <Ring
            value={t.kcal.value}
            target={budget}
            uncertain={unsure}
            size={140}
            stroke={13}
            color={toneColors[tone].ring}
            overColor={toneColors[tone].lap}
            label="Calories"
            unit="kcal"
          >
            <span className={`ring-big tone-${tone}`}>
              {unsure && left > 0 ? "≤" : ""}
              {fmt(Math.abs(left))}
            </span>
            <span className="ring-sub">{left < 0 ? "kcal over" : "kcal left"}</span>
          </Ring>
          <div className="macro-rings">
            {macroMeta.map((m) => (
              <MacroRow key={m.key} part={t[m.key]} goal={goals[m.key]} label={m.label} short={m.short} />
            ))}
          </div>
        </div>
        <div className="summary-legend">
          <span>
            Eaten {unsure ? "≥" : ""}
            {fmt(t.kcal.value)}
          </span>
          <span>
            Budget {fmt(goals.kcal)}
            {t.burned > 0 && <span className="kcal-burn"> + {fmt(t.burned)} exercise</span>}
          </span>
          {unsure && (
            <span className="legend-unsure">
              <i className="swatch swatch-fuzzy" /> {t.kcal.missing} {t.kcal.missing === 1 ? "thing has" : "things have"} no calories yet
            </span>
          )}
        </div>
      </div>
      <FluidBar part={t.fluid} goalMl={goals.fluidMl} units={units} />
    </section>
  );
}

/** Amber from close to the budget until a little over it, red once well past it. */
const CLOSE_SHARE = 0.9;
const HEAVY_SHARE = 1.1;

type KcalTone = "ok" | "close" | "over";

function kcalTone(eaten: number, budget: number): KcalTone {
  if (budget <= 0) return "ok";
  const share = eaten / budget;
  return share > HEAVY_SHARE ? "over" : share >= CLOSE_SHARE ? "close" : "ok";
}

const toneColors: Record<KcalTone, { ring: string; lap: string }> = {
  ok: { ring: "var(--kcal)", lap: "var(--kcal)" },
  close: { ring: "var(--close)", lap: "var(--close-deep)" },
  over: { ring: "var(--over)", lap: "var(--over-deep)" },
};

function MacroRow({ part, goal, label, short }: { part: Part; goal: number; label: string; short: string }) {
  const unsure = part.missing > 0;
  return (
    <div className={`macro-ring-row macro-${label.toLowerCase()}`}>
      <Ring value={part.value} target={goal} uncertain={unsure} size={42} stroke={6} color="var(--macro)" label={label} unit="g">
        <span className="macro-icon">{short}</span>
      </Ring>
      <div className="macro-ring-text">
        <b>
          {unsure ? "≥" : ""}
          {fmt(part.value)} g
        </b>
        <small>
          {label} · of {goal} g
        </small>
      </div>
    </div>
  );
}

function FluidBar({ part, goalMl, units }: { part: Part; goalMl: number; units: "metric" | "imperial" }) {
  const share = Math.min(part.value / goalMl, 1);
  return (
    <div className="fluid-col" role="img" aria-label={`Fluid ${formatFluid(part.value, units)} of ${formatFluid(goalMl, units)}`}>
      <span className="fluid-icon" aria-hidden>
        💧
      </span>
      <span className={`fluid-track ${part.missing ? "fluid-unsure" : ""}`}>
        <i style={{ height: `${share * 100}%` }} data-empty={share === 0 || undefined} />
      </span>
      <span className="fluid-value">
        {part.missing ? "≥" : ""}
        {formatFluid(part.value, units)}
        <small>/ {formatFluid(goalMl, units)}</small>
      </span>
    </div>
  );
}

function Timeline({ entries, actions }: { entries: Entry[]; actions: EntryActions }) {
  const [open, setOpen] = useState<string>();
  if (!entries.length) return <p className="empty">Nothing logged yet.</p>;

  const groups = [...dayParts.map((p) => ({ key: p.part as string, label: p.label })), { key: "unknown", label: "Sometime" }]
    .map((g) => ({ ...g, entries: entries.filter((e) => (partOf(e.when) ?? "unknown") === g.key) }))
    .filter((g) => g.entries.length);

  return (
    <section className="timeline">
      {groups.map((g) => (
        <div key={g.key}>
          <h2 className="list-heading">{g.label}</h2>
          {g.entries.map((e) => (
            <EntryRow key={e.id} entry={e} open={open === e.id} onToggle={() => setOpen(open === e.id ? undefined : e.id)} actions={actions} />
          ))}
        </div>
      ))}
    </section>
  );
}

/** "4:05 pm" is too wide for the time column, so am/pm goes on a line of its own. */
function ClockTime({ time }: { time: string }) {
  const [clock, meridiem] = time.split(" ");
  return (
    <>
      {clock}
      {meridiem && <small className="entry-meridiem">{meridiem}</small>}
    </>
  );
}

export function lineName(l: Line, foods: FoodLookup) {
  const food = foods(l.foodId);
  if (food) return displayName(food);
  return l.rawName ?? "Something";
}

const lineIcon = (l: Line, foods: FoodLookup) => foods(l.foodId)?.icon ?? "✎";

/** "Just calories" is an entry-only item counted in pieces with one piece logged. */
function isJustCalories(l: Line, foods: FoodLookup) {
  const item = asItem(foods(l.foodId));
  return !!item && !item.catalogued && item.unit === "piece" && !item.servings.length && l.amount.unit === "piece" && l.amount.value === 1;
}

function lineDetail(l: Line, foods: FoodLookup) {
  const batch = asRecipe(foods(l.foodId))?.batches.find((b) => b.id === l.batchId);
  const amount = isJustCalories(l, foods) ? "just calories" : formatAmount(l.amount);
  return batch ? `${amount} · ${batchLabel(batch)} batch` : amount;
}

export function EntryRow({ entry, open, onToggle, actions, showDay = false }: { entry: Entry; open: boolean; onToggle: () => void; actions: EntryActions; showDay?: boolean }) {
  const foods = useFoodLookup();
  const activities = useActivityLookup();
  const badges: { text: string; tone: "warn" | "muted" }[] = [];
  let title: string;
  let icon: string;
  let detail: string;
  let kcal = "";
  let macros: Contents | undefined;
  let breakdown: { title: string; rows: BreakdownRow[] } | undefined;

  if (entry.kind === "food") {
    const single = entry.lines.length === 1 && !entry.comboId ? entry.lines[0] : undefined;
    const date = entry.when.date;
    const ingredients = (l: Line) => {
      const recipe = asRecipe(foods(l.foodId));
      return recipe ? ingredientRows(recipe, l.batchId, l.amount, foods) : undefined;
    };
    if (single) {
      const inside = ingredients(single);
      if (inside) breakdown = { title: inside.whole ? "In the whole batch" : "In this portion", rows: inside.rows };
    } else {
      const rows = entry.lines.map((l) => ({
        key: l.id,
        icon: lineIcon(l, foods),
        name: lineName(l, foods),
        amount: lineDetail(l, foods),
        contents: lineContents(l, date, foods),
        parts: ingredients(l)?.rows,
      }));
      breakdown = { title: "What's in it", rows };
    }
    const combo = foods(entry.comboId);
    title = combo?.name ?? (single ? lineName(single, foods) : `${entry.lines.length} things`);
    icon = combo?.icon ?? (single ? lineIcon(single, foods) : "🍱");
    detail = single ? lineDetail(single, foods) : entry.lines.map((l) => lineName(l, foods)).join(", ");
    macros = entryContents(entry, foods);
    kcal = kcalText(macros);
    if (entry.lines.some((l) => asItem(foods(l.foodId))?.unsure)) badges.push({ text: "Unsure item", tone: "warn" });
    if (entry.lines.some((l) => l.amount.value === undefined)) badges.push({ text: "Amount unknown", tone: "warn" });
    const singleItem = asItem(foods(single?.foodId));
    if (single && (!single.foodId || (singleItem && !singleItem.catalogued)) && !isJustCalories(single, foods)) badges.push({ text: "Not an item", tone: "muted" });
  } else {
    const a = activities(entry.activityId);
    title = a?.name ?? "Activity";
    icon = a?.icon ?? "✎";
    detail =
      Object.values(entry.measures)
        .map((m) => `${m.value} ${m.unit}`)
        .join(" · ") || "no measures";
    if (entry.kcal !== undefined) kcal = `${entry.kcal} kcal`;
  }
  if (entryNeedsFollowUp(entry, foods)) badges.push({ text: "Follow up", tone: "muted" });
  // Within a day the part-of-day heading already says "Morning", so only clock times are shown.
  const time = showDay ? whenLabel(entry.when, true) : entry.when.kind === "now" || entry.when.kind === "exact" ? formatTime(entry.when.time) : undefined;

  return (
    <div className={`entry ${open ? "open" : ""}`}>
      <button className="entry-main" onClick={onToggle} aria-expanded={open}>
        {time ? (
          <span className={`entry-time ${showDay ? "entry-time-wide" : ""}`}>{showDay ? time : <ClockTime time={time} />}</span>
        ) : (
          <span className="entry-time entry-time-none">No time</span>
        )}
        <span className="entry-icon">{icon}</span>
        <span className="entry-body">
          <span className="row-title">{title}</span>
          <span className="row-sub">{detail}</span>
          {macros && <MiniMacros contents={macros} />}
          {badges.length > 0 && (
            <span className="badges">
              {badges.map((b) => (
                <span key={b.text} className={`badge badge-${b.tone}`}>
                  {b.text}
                </span>
              ))}
            </span>
          )}
        </span>
        <span className={`entry-kcal ${entry.kind === "exercise" ? "kcal-burn" : "kcal-eat"}`}>{kcal}</span>
      </button>
      {open && (
        <div className="entry-open">
          {breakdown && <Breakdown title={breakdown.title} rows={breakdown.rows} />}
          <div className="entry-actions">
            <button className="btn btn-small" onClick={() => actions.onEdit(entry)}>
              Edit
            </button>
            <button className="btn btn-small" onClick={() => actions.onDuplicate(entry)}>
              Log again
            </button>
            <button className="icon-btn trash-btn" onClick={() => actions.onDelete(entry)} aria-label={`Delete ${title}`} title="Delete">
              <TrashIcon />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function InboxScreen({ onMenu, actions }: { onMenu: () => void; actions: EntryActions }) {
  const followUp = useFollowUp();
  const foods = useFoodLookup();
  const { close } = useSteps("list");
  const open = useOpen();
  const [expanded, setExpanded] = useState<string>();
  const unsure = followUp.unsureItems.flatMap((u) => {
    const item = asItem(foods(u.foodId));
    return item ? [{ ...u, item }] : [];
  });
  const pending = [...followUp.entries].sort((a, b) => sortKey(b.when).localeCompare(sortKey(a.when)));

  return (
    <FlowShell title="To follow up" canGoBack={false} onBack={close} onClose={close} onMenu={onMenu}>
      {unsure.length === 0 && pending.length === 0 && <p className="empty">Nothing left to follow up.</p>}
      {unsure.length > 0 && (
        <>
          <h2 className="list-heading">Unsure items</h2>
          <p className="hint">Things logged by name. Fill in one label and every entry using it gets its values.</p>
          <ul className="list">
            {unsure.map(({ item, entryIds, usedByFoodIds }) => (
              <li key={item.id}>
                <button className="row row-unsure" onClick={() => open(`/items/${item.id}`)}>
                  <span className="row-icon">{item.icon}</span>
                  <span className="row-main">
                    <span className="row-title">{item.name}</span>
                    <span className="row-sub">
                      {[entryIds.length > 0 && `Logged ${entryIds.length}×`, usedByFoodIds.length > 0 && `in ${usedByFoodIds.map((id) => foods(id)?.name ?? "?").join(", ")}`, item.barcode && `barcode ${item.barcode}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <span className="row-chevron">›</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {pending.length > 0 && (
        <>
          <h2 className="list-heading">Entries</h2>
          <p className="hint">Missing calories.</p>
          {pending.map((e) => (
            <EntryRow key={e.id} entry={e} open={expanded === e.id} onToggle={() => setExpanded(expanded === e.id ? undefined : e.id)} actions={actions} showDay />
          ))}
        </>
      )}
    </FlowShell>
  );
}
