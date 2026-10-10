import { useState } from "react";
import { activityById } from "../../core/activities";
import { useEntries } from "../../core/entries";
import { entryNeedsFollowUp, followUpCount, unsureItemsInUse } from "../../core/followUp";
import { batchLabel, cookingNow, displayName, foodById, foodIcon, itemById, recipeById, useFoods } from "../../core/foods";
import { useDailyTargets } from "../../core/goals";
import { formatAmount } from "../../core/label";
import { type Contents, dayTotals, entryContents, type Part } from "../../core/nutrition";
import { useProfile } from "../../core/profile";
import { dayHeading, dayParts, partOf, shiftDate, sortKey, todayKey, whenLabel } from "../../core/time";
import type { Entry, FoodEntry, Line } from "../../core/types";
import { formatFluid } from "../../core/units";
import { FlowShell } from "../ui/FlowShell";
import { Ring } from "../ui/Ring";
import { TrashIcon } from "../ui/TrashIcon";
import { MissingDetails } from "../ui/MissingDetails";
import { useOpen, useSteps } from "../ui/useSteps";

export interface EntryActions {
  onEdit: (e: Entry) => void;
  onDuplicate: (e: Entry) => void;
  onDelete: (e: Entry) => void;
}

const fmt = (n: number) => Math.round(n).toLocaleString();

export function Today({ day, setDay, onMenu, actions }: { day: string; setDay: (d: string) => void; onMenu: () => void; actions: EntryActions }) {
  const entries = useEntries();
  useFoods();
  const open = useOpen();
  const targets = useDailyTargets(day);
  const dayQuery = day === todayKey() ? "" : `?day=${day}`;
  const dayEntries = entries.filter((e) => e.when.date === day).sort((a, b) => sortKey(a.when).localeCompare(sortKey(b.when)));
  const inbox = followUpCount(entries);
  const cooking = cookingNow();

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
      <Timeline entries={dayEntries} actions={actions} />

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

const macroMeta = [
  { key: "protein", label: "Protein", short: "P" },
  { key: "carbs", label: "Carbs", short: "C" },
  { key: "fat", label: "Fat", short: "F" },
] as const;

/** "≥" on what's eaten and "≤" on what's left whenever something logged has no value yet. */
function DaySummary({ entries, day }: { entries: Entry[]; day: string }) {
  const goals = useDailyTargets(day);
  const { units } = useProfile();
  const t = dayTotals(entries);
  const budget = goals.kcal + t.burned;
  const left = budget - t.kcal.value;
  const unsure = t.kcal.missing > 0;

  return (
    <section className="summary">
      <div className="summary-main">
        <div className="summary-rings">
          <Ring value={t.kcal.value} target={budget} uncertain={unsure} size={140} stroke={13} color="var(--kcal)" label="Calories" unit="kcal">
            <span className="ring-big">
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

export function lineName(l: Line) {
  const food = foodById(l.recipeId ?? l.itemId);
  if (food) return displayName(food);
  return l.rawName ?? "Calories";
}

function lineIcon(l: Line) {
  const food = foodById(l.recipeId ?? l.itemId);
  return food ? foodIcon(food) : "✎";
}

function lineDetail(l: Line) {
  const recipe = recipeById(l.recipeId);
  const batch = recipe?.batches.find((b) => b.id === l.batchId);
  const amount = l.own && l.own.unit === "piece" && l.amount.unit === "piece" && l.amount.value === 1 && !l.own.servings.length ? "just calories" : formatAmount(l.amount);
  return batch ? `${amount} · ${batchLabel(batch)} batch` : amount;
}

const kcalText = (c: Contents) => {
  const k = c.kcal;
  if (!k || (!k.complete && k.value === 0)) return "? kcal";
  return `${k.complete ? "" : "≥"}${Math.round(k.value)} kcal`;
};

export function EntryRow({ entry, open, onToggle, actions, showDay = false }: { entry: Entry; open: boolean; onToggle: () => void; actions: EntryActions; showDay?: boolean }) {
  const badges: { text: string; tone: "warn" | "muted" }[] = [];
  let title: string;
  let icon: string;
  let detail: string;
  let kcal = "";
  let macros: Contents | undefined;
  let lines: Line[] = [];

  if (entry.kind === "food") {
    const f = entry as FoodEntry;
    lines = f.lines;
    const single = f.lines.length === 1 && !f.comboId ? f.lines[0] : undefined;
    title = foodById(f.comboId)?.name ?? f.title ?? (single ? lineName(single) : `${f.lines.length} things`);
    icon = f.comboId ? (foodById(f.comboId) ? foodIcon(foodById(f.comboId)!) : "🍱") : single ? lineIcon(single) : "🍱";
    detail = single ? lineDetail(single) : f.lines.map(lineName).join(", ");
    macros = entryContents(f);
    kcal = kcalText(macros);
    if (f.lines.some((l) => itemById(l.itemId)?.unsure)) badges.push({ text: "Unsure item", tone: "warn" });
    if (f.lines.some((l) => l.amount.value === undefined)) badges.push({ text: "Amount unknown", tone: "warn" });
    if (single && !single.itemId && !single.recipeId && detail !== "just calories") badges.push({ text: "Not an item", tone: "muted" });
  } else {
    const a = activityById(entry.activityId);
    title = a ? a.name : `“${entry.rawName}”`;
    icon = a?.icon ?? "✎";
    if (!a) badges.push({ text: "Not in your activities", tone: "warn" });
    detail =
      Object.values(entry.measures)
        .map((m) => `${m.value} ${m.unit}`)
        .join(" · ") || "no measures";
    if (entry.kcal !== undefined) kcal = `${entry.kcal} kcal`;
  }
  if (entryNeedsFollowUp(entry)) badges.push({ text: "Follow up", tone: "muted" });

  return (
    <div className={`entry ${open ? "open" : ""}`}>
      <button className="entry-main" onClick={onToggle} aria-expanded={open}>
        {/* Within a day the part-of-day heading already says "Morning", so only clock times are shown. */}
        <span className={`entry-time ${showDay ? "entry-time-wide" : ""}`}>
          {showDay ? whenLabel(entry.when, true) : entry.when.kind === "now" || entry.when.kind === "exact" ? entry.when.time : ""}
        </span>
        <span className="entry-icon">{icon}</span>
        <span className="entry-body">
          <span className="row-title">{title}</span>
          <span className="row-sub">{detail}</span>
          {macros && (
            <span className="entry-macros">
              {macroMeta.map((m) => {
                const v = macros![m.key];
                const has = v && (v.complete || v.value > 0);
                return (
                  <span key={m.key} className={`mini-macro macro-${m.key}`} title={m.label}>
                    <i aria-hidden /> {m.short} {has ? `${v.complete ? "" : "≥"}${Math.round(v.value)}` : "?"} g
                  </span>
                );
              })}
            </span>
          )}
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
          {lines.length > 1 && (
            <ul className="entry-lines">
              {lines.map((l) => (
                <li key={l.id}>
                  <span>{lineIcon(l)}</span> {lineName(l)} <small>{lineDetail(l)}</small>
                </li>
              ))}
            </ul>
          )}
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
  const entries = useEntries();
  useFoods();
  const { close } = useSteps("list");
  const open = useOpen();
  const [expanded, setExpanded] = useState<string>();
  const unsure = unsureItemsInUse(entries);
  const pending = entries.filter(entryNeedsFollowUp).sort((a, b) => sortKey(b.when).localeCompare(sortKey(a.when)));

  return (
    <FlowShell title="To follow up" canGoBack={false} onBack={close} onClose={close} onMenu={onMenu}>
      {unsure.length === 0 && pending.length === 0 && <p className="empty">Nothing left to follow up.</p>}
      {unsure.length > 0 && (
        <>
          <h2 className="list-heading">Unsure items</h2>
          <p className="hint">Things logged by name. Fill in one label and every entry using it gets its values.</p>
          <ul className="list">
            {unsure.map(({ item, entries: used, inFoods }) => (
              <li key={item.id}>
                <button className="row row-unsure" onClick={() => open(`/items/${item.id}`)}>
                  <span className="row-icon">{foodIcon(item)}</span>
                  <span className="row-main">
                    <span className="row-title">{item.name}</span>
                    <span className="row-sub">
                      {[used.length > 0 && `Logged ${used.length}×`, inFoods.length > 0 && `in ${inFoods.map((f) => f.name).join(", ")}`, item.barcode && `barcode ${item.barcode}`]
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
          <p className="hint">Missing calories or an activity.</p>
          {pending.map((e) => (
            <EntryRow key={e.id} entry={e} open={expanded === e.id} onToggle={() => setExpanded(expanded === e.id ? undefined : e.id)} actions={actions} showDay />
          ))}
        </>
      )}
    </FlowShell>
  );
}
