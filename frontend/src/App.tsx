import { useCallback, useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useParams, useSearchParams } from "react-router";
import { activityById, itemById, itemIcon } from "./data/catalogue";
import { entryNeedsFollowUp, followUpCount, isCalorieOnly, provisionalItems } from "./data/followUp";
import { removeUserItem, saveUserItem, useUserItems } from "./data/userItems";
import { useProfile } from "./data/profile";
import { formatFluid } from "./data/units";
import { Onboarding, SettingsScreen, WeighInsScreen } from "./screens/ProfileScreens";
import { GoalsScreen } from "./screens/GoalsScreen";
import { ActivitiesScreen, ActivityDetailRoute } from "./screens/ActivityScreens";
import { ItemDetailRoute, ItemListRow, ItemsScreen, type Notify } from "./screens/ItemScreens";
import { FlowShell } from "./components/FlowShell";
import { TrashIcon } from "./components/TrashIcon";
import { Ring } from "./components/Ring";
import { useOpen, useSteps } from "./components/useSteps";
import { baseAmountLabel, entryMacros } from "./data/explain";
import { useDailyTargets } from "./data/goals";
import { addEntry, calculatedKcal, removeEntry, storedEntries, updateEntry, useEntries } from "./data/store";
import { dayTotals } from "./data/totals";
import { dayHeading, dayParts, partOf, shiftDate, sortKey, todayKey, whenLabel } from "./data/time";
import type { Entry } from "./data/types";
import { ExerciseFlow } from "./flows/ExerciseFlow";
import { FoodFlow } from "./flows/FoodFlow";

interface EntryActions {
  onEdit: (e: Entry) => void;
  onDuplicate: (e: Entry) => void;
  onDelete: (e: Entry) => void;
}

/** The day a page is about: "?day=" when it's a valid past day, otherwise today. */
function useDay(): [string, (d: string) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get("day");
  const day = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) && raw < todayKey() ? raw : todayKey();
  // Paging through days replaces the entry, so back leaves the day view instead of retracing days.
  const setDay = (d: string) => setParams(d === todayKey() ? {} : { day: d }, { replace: true, state: routerState() });
  return [day, setDay];
}

/** React Router keeps navigation state under "usr"; kept so paging days doesn't lose it. */
function routerState() {
  return history.state?.usr;
}

const sections: { path: string; target: NavTarget }[] = [
  { path: "/items", target: "items" },
  { path: "/activities", target: "activities" },
  { path: "/weigh-ins", target: "weighIns" },
  { path: "/goal", target: "goals" },
  { path: "/follow-up", target: "inbox" },
  { path: "/settings", target: "settings" },
];

const targetPath = (t: NavTarget) => (t === "today" ? "/" : sections.find((s) => s.target === t)!.path);

export function App() {
  const [toast, setToast] = useState<Toast>();
  const [drawer, setDrawer] = useState(false);
  const entries = useEntries();
  const { onboarded } = useProfile();
  const location = useLocation();
  const open = useOpen();
  useUserItems();

  const current: NavTarget | undefined =
    location.pathname === "/" ? "today" : sections.find((s) => location.pathname === s.path || location.pathname.startsWith(`${s.path}/`))?.target;

  const navigate = (target: NavTarget) => {
    setDrawer(false);
    if (target !== current || location.search) open(targetPath(target));
  };

  const finish = useCallback((saved?: Entry, previous?: Entry) => {
    if (saved) setToast({ id: Date.now(), message: "Saved", undo: () => (previous ? updateEntry(previous) : removeEntry(saved.id)) });
  }, []);

  const notify: Notify = useCallback((message, undo) => setToast({ id: Date.now(), message, undo }), []);

  const remove = (entry: Entry) => {
    removeEntry(entry.id);
    // An unsure item only exists to be followed up through its entries; without any it's noise.
    const item = entry.kind === "food" ? itemById(entry.itemId) : undefined;
    const orphaned = item?.provisional && !storedEntries().some((e) => e.kind === "food" && e.itemId === item.id);
    if (orphaned) removeUserItem(item.id);
    notify("Deleted", () => {
      if (orphaned) saveUserItem(item);
      addEntry(entry);
    });
  };

  const actions: EntryActions = {
    onEdit: (entry) => open(`/entry/${entry.id}/edit`),
    onDuplicate: (entry) => open(`/entry/${entry.id}/duplicate`),
    onDelete: remove,
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(undefined), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const openMenu = () => setDrawer(true);

  return (
    <>
      {onboarded ? (
        <div className="shell">
          <Sidebar entries={entries} current={current} onOpen={navigate} />
          <div className="shell-main">
            <Routes>
              <Route path="/" element={<Home entries={entries} openMenu={openMenu} actions={actions} />} />
              <Route path="/log/food" element={<LogRoute kind="food" finish={finish} />} />
              <Route path="/log/exercise" element={<LogRoute kind="exercise" finish={finish} />} />
              <Route path="/entry/:id/:mode" element={<EntryRoute finish={finish} />} />
              <Route path="/items" element={<ItemsScreen onMenu={openMenu} notify={notify} />} />
              <Route path="/items/:id" element={<ItemDetailRoute notify={notify} />} />
              <Route path="/items/:id/:dup" element={<ItemDetailRoute notify={notify} />} />
              <Route path="/activities" element={<ActivitiesScreen onMenu={openMenu} notify={notify} />} />
              <Route path="/activities/:id" element={<ActivityDetailRoute notify={notify} />} />
              <Route path="/activities/:id/:dup" element={<ActivityDetailRoute notify={notify} />} />
              <Route path="/follow-up" element={<InboxView entries={entries} onMenu={openMenu} actions={actions} />} />
              <Route path="/weigh-ins" element={<WeighInsScreen onMenu={openMenu} notify={notify} />} />
              <Route path="/goal" element={<GoalsScreen onMenu={openMenu} onSettings={() => navigate("settings")} />} />
              <Route path="/settings" element={<SettingsScreen onMenu={openMenu} />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
          {drawer && <Drawer entries={entries} current={current} onClose={() => setDrawer(false)} onOpen={navigate} />}
        </div>
      ) : (
        <Onboarding />
      )}
      {toast && (
        <div className="toast" role="status" key={toast.id}>
          {toast.message}
          {toast.undo && (
            <button
              onClick={() => {
                toast.undo!();
                setToast(undefined);
              }}
            >
              Undo
            </button>
          )}
        </div>
      )}
    </>
  );
}

interface Toast {
  id: number;
  message: string;
  undo?: () => void;
}

function LogRoute({ kind, finish }: { kind: "food" | "exercise"; finish: (saved?: Entry, previous?: Entry) => void }) {
  const [day] = useDay();
  return kind === "food" ? <FoodFlow date={day} onDone={finish} /> : <ExerciseFlow date={day} onDone={finish} />;
}

/** Edit or duplicate an entry by id; one that no longer exists goes back to the day view. */
function EntryRoute({ finish }: { finish: (saved?: Entry, previous?: Entry) => void }) {
  const { id, mode } = useParams();
  const entry = useEntries().find((e) => e.id === id);
  if (!entry || (mode !== "edit" && mode !== "duplicate")) return <Navigate to="/" replace />;
  const m = { kind: mode, entry } as const;
  return entry.kind === "food" ? (
    <FoodFlow key={`${mode}-${id}`} date={entry.when.date} mode={m as { kind: "edit" | "duplicate"; entry: typeof entry }} onDone={finish} />
  ) : (
    <ExerciseFlow key={`${mode}-${id}`} date={entry.when.date} mode={m as { kind: "edit" | "duplicate"; entry: typeof entry }} onDone={finish} />
  );
}

function Home({ entries, openMenu, actions }: { entries: Entry[]; openMenu: () => void; actions: EntryActions }) {
  const [day, setDay] = useDay();
  const open = useOpen();
  const dayQuery = day === todayKey() ? "" : `?day=${day}`;
  const dayEntries = entries.filter((e) => e.when.date === day).sort((a, b) => sortKey(a.when).localeCompare(sortKey(b.when)));
  const inbox = followUpCount(entries);

  return (
    <div className="home">
      <header className="home-header">
        <button className="icon-btn menu-btn" onClick={openMenu} aria-label="Menu">
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
        {day !== todayKey() && (
          <button className="chip today-btn" onClick={() => setDay(todayKey())}>
            Today
          </button>
        )}
      </header>

      {inbox > 0 && (
        <div className="home-chips">
          <button className="inbox-pill" onClick={() => open("/follow-up")}>
            📥 {inbox} to follow up ›
          </button>
        </div>
      )}

      <div className="home-grid">
        <div className="home-side">
          <DaySummary entries={dayEntries} day={day} />
          {/* Fixed to the bottom on phones; under the summary on desktop. Either way it logs to the day shown. */}
          <nav className="quick-add">
            <button className="qa-btn qa-food" onClick={() => open(`/log/food${dayQuery}`)}>
              <span>🍽️</span>I ate
            </button>
            <button className="qa-btn qa-exercise" onClick={() => open(`/log/exercise${dayQuery}`)}>
              <span>🏃</span>I exercised
            </button>
          </nav>
        </div>
        <Timeline entries={dayEntries} actions={actions} />
      </div>
    </div>
  );
}

function DaySummary({ entries, day }: { entries: Entry[]; day: string }) {
  const goals = useDailyTargets(day);
  const t = dayTotals(entries);
  const budget = goals.kcal + t.burned;
  const eaten = t.kcal.calculated + t.kcal.estimated;
  const left = budget - eaten;
  const kcalUnsure = t.kcal.missing > 0;
  const fmt = (n: number) => Math.round(n).toLocaleString();

  return (
    <section className="summary">
      <div className="summary-main">
        <div className="summary-rings">
          <Ring value={eaten} target={budget} uncertain={kcalUnsure} size={148} stroke={14} color="var(--kcal)" label="Calories" unit="kcal">
            <span className="ring-big">
              {kcalUnsure && left > 0 ? "≤" : ""}
              {fmt(Math.abs(left))}
            </span>
            <span className="ring-sub">{left < 0 ? "kcal over" : "kcal left"}</span>
          </Ring>
          <div className="macro-rings">
            {macroMeta.map((m) => {
              const part = t.macros[m.key];
              const unsure = part.missing > 0;
              return (
                <div key={m.key} className={`macro-ring-row macro-${m.key}`}>
                  <Ring
                    value={part.calculated + part.estimated}
                    target={goals[m.key]}
                    uncertain={unsure}
                    size={44}
                    stroke={6}
                    color="var(--macro)"
                    label={m.label}
                    unit="g"
                  >
                    <span className={`macro-icon ${unsure ? "macro-icon-unsure" : ""}`}>{m.short}</span>
                  </Ring>
                  <div className="macro-ring-text">
                    <b>
                      {unsure ? "≥" : ""}
                      {fmt(part.calculated + part.estimated)} g
                    </b>
                    <small>
                      {m.label} · of {goals[m.key]} g
                    </small>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="summary-legend">
          <span>
            Eaten {kcalUnsure ? "≥" : ""}
            {fmt(eaten)}
          </span>
          <span>
            Budget {fmt(goals.kcal)}
            {t.burned > 0 && <span className="kcal-burn"> + {fmt(t.burned)} exercise</span>}
          </span>
          {kcalUnsure && (
            <span className="legend-unsure">
              <i className="swatch swatch-fuzzy" /> {t.kcal.missing} {t.kcal.missing === 1 ? "entry has" : "entries have"} no calories yet
            </span>
          )}
        </div>
      </div>
      <FluidBar ml={t.fluid.ml} unknown={t.fluid.unknown} goalMl={goals.fluidMl} />
    </section>
  );
}

function FluidBar({ ml, unknown, goalMl: fluidGoalMl }: { ml: number; unknown: number; goalMl: number }) {
  const { units } = useProfile();
  const share = Math.min(ml / fluidGoalMl, 1);
  return (
    <div className="fluid-col" role="img" aria-label={`Fluid ${formatFluid(ml, units)} of ${formatFluid(fluidGoalMl, units)}`}>
      <span className="fluid-icon" aria-hidden>
        💧
      </span>
      <span className={`fluid-track ${unknown ? "fluid-unsure" : ""}`}>
        <i style={{ height: `${share * 100}%` }} data-empty={share === 0 || undefined} />
      </span>
      <span className="fluid-value">
        {unknown ? "≥" : ""}
        {formatFluid(ml, units)}
        <small>/ {formatFluid(fluidGoalMl, units)}</small>
      </span>
    </div>
  );
}

const macroMeta = [
  { key: "protein", label: "Protein", short: "P" },
  { key: "carbs", label: "Carbs", short: "C" },
  { key: "fat", label: "Fat", short: "F" },
] as const;

function Timeline({ entries, actions }: { entries: Entry[]; actions: EntryActions }) {
  const [open, setOpen] = useState<string>();
  if (!entries.length) return <p className="empty">Nothing logged yet. Use the buttons below.</p>;

  const groups = [...dayParts.map((p) => ({ key: p.part as string, label: p.label })), { key: "unknown", label: "Not sure" }]
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

function EntryRow({
  entry,
  open,
  onToggle,
  actions,
  showDay = false,
}: {
  entry: Entry;
  open: boolean;
  onToggle: () => void;
  actions: EntryActions;
  showDay?: boolean;
}) {
  const badges: { text: string; tone: "warn" | "muted" }[] = [];
  let title: string;
  let detail: string;
  let kcalText = "";
  let variant: string | undefined;
  let macros: ReturnType<typeof entryMacros>;

  const calorieOnly = entry.kind === "food" && isCalorieOnly(entry);
  if (calorieOnly && entry.kind === "food") {
    title = entry.note ?? "Calories";
    detail = "Just calories";
    macros = entryMacros(entry);
    kcalText = entry.estimate?.kcal !== undefined ? `≈${entry.estimate.kcal.toLocaleString()} kcal` : "? kcal";
  } else if (entry.kind === "food") {
    const item = itemById(entry.itemId);
    title = item ? `${item.provisional ? "" : `${itemIcon(item)} `}${item.name}` : entry.rawName ? `“${entry.rawName}”` : "Removed item";
    variant = item?.variant;
    macros = entryMacros(entry);
    if (item?.provisional) badges.push({ text: "Unsure item", tone: "warn" });
    const base = baseAmountLabel(entry);
    detail = entry.amount.value !== undefined ? `${entry.amount.value} ${entry.amount.unit ?? ""}${base ? ` · ${base}` : ""}` : "amount unknown";
    if (entry.amount.value === undefined) badges.push({ text: "Amount unknown", tone: "warn" });
    const k = calculatedKcal(entry);
    kcalText = k !== undefined ? `${Math.round(k)} kcal` : entry.estimate?.kcal !== undefined ? `≈${entry.estimate.kcal} kcal` : "? kcal";
  } else {
    const a = activityById(entry.activityId);
    title = a ? `${a.icon} ${a.name}` : `“${entry.rawName}”`;
    if (!a) badges.push({ text: "Not in your activities", tone: "warn" });
    detail = Object.values(entry.measures)
      .map((m) => `${m.value} ${m.unit}`)
      .join(" · ") || "no measures";
    if (entry.kcalEstimate !== undefined) kcalText = `${entry.kcalEstimate} kcal`;
  }
  if (entryNeedsFollowUp(entry)) badges.push({ text: "Follow up", tone: "muted" });

  return (
    <div className={`entry ${open ? "open" : ""} ${calorieOnly ? "entry-calories" : ""}`}>
      <button className="entry-main" onClick={onToggle} aria-expanded={open}>
        <span className="entry-time">
          {showDay ? whenLabel(entry.when) : whenLabel(entry.when, false)}
        </span>
        <span className="entry-body">
          <span className="row-title">
            {title} {variant && <span className="badge badge-variant">{variant}</span>}
          </span>
          <span className="row-sub">{detail}</span>
          {macros && (
            <span className="entry-macros">
              {macroMeta.map((m) => (
                <span key={m.key} className={`mini-macro macro-${m.key}`} title={m.label}>
                  <i aria-hidden /> {m.short} {macros![m.key] ?? "?"} g
                </span>
              ))}
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
        <span className={`entry-kcal ${entry.kind === "exercise" ? "kcal-burn" : "kcal-eat"}`}>{kcalText}</span>
      </button>
      {open && (
        <div className="entry-actions">
          <button className="btn btn-small" onClick={() => actions.onEdit(entry)}>
            ✏️ Edit
          </button>
          <button className="btn btn-small" onClick={() => actions.onDuplicate(entry)}>
            ⧉ Duplicate
          </button>
          <button className="row-action trash-btn" onClick={() => actions.onDelete(entry)} aria-label={`Delete ${title}`} title="Delete">
            <TrashIcon />
          </button>
        </div>
      )}
    </div>
  );
}

function InboxView({ entries, onMenu, actions }: { entries: Entry[]; onMenu: () => void; actions: EntryActions }) {
  const { close } = useSteps("list");
  const openPath = useOpen();
  const [open, setOpen] = useState<string>();
  const unsure = provisionalItems(entries);
  const pending = entries.filter(entryNeedsFollowUp).sort((a, b) => sortKey(b.when).localeCompare(sortKey(a.when)));

  return (
    <FlowShell title="To follow up" canGoBack={false} onBack={close} onClose={close} onMenu={onMenu}>
      {unsure.length === 0 && pending.length === 0 && <p className="empty">Nothing left to follow up.</p>}
      {unsure.length > 0 && (
        <>
          <h2 className="list-heading">Unsure items</h2>
          <p className="hint">Things you logged by name. Complete one once and every entry using it gets its calories.</p>
          <ul className="list">
            {unsure.map(({ item: i, entries: used }) => (
              <ItemListRow
                key={i.id}
                item={i}
                uses={used.length}
                onOpen={(item) => openPath(`/items/${item.id}`)}
              />
            ))}
          </ul>
        </>
      )}
      {pending.length > 0 && (
        <>
          <h2 className="list-heading">Entries</h2>
          {pending.map((e) => (
            <EntryRow key={e.id} entry={e} open={open === e.id} onToggle={() => setOpen(open === e.id ? undefined : e.id)} actions={actions} showDay />
          ))}
        </>
      )}
    </FlowShell>
  );
}

type NavTarget = "today" | "items" | "activities" | "weighIns" | "goals" | "inbox" | "settings";

function NavLinks({ entries, current, onOpen }: { entries: Entry[]; current?: string; onOpen: (t: NavTarget) => void }) {
  const links: { target: NavTarget; icon: string; label: string; count?: number }[] = [
    { target: "today", icon: "📅", label: "Today" },
    { target: "items", icon: "🥫", label: "Items", count: provisionalItems(entries).length },
    { target: "activities", icon: "🏃", label: "Activities" },
    { target: "weighIns", icon: "⚖️", label: "Weigh-ins" },
    { target: "goals", icon: "🎯", label: "Goal" },
    { target: "inbox", icon: "📥", label: "To follow up", count: followUpCount(entries) },
    { target: "settings", icon: "⚙️", label: "Settings" },
  ];
  return (
    <>
      {links.map((l) => (
        <button key={l.target} className="drawer-link" aria-current={current === l.target ? "page" : undefined} onClick={() => onOpen(l.target)}>
          <span aria-hidden>{l.icon}</span>
          {l.label}
          {!!l.count && <span className="badge badge-warn">{l.count}</span>}
        </button>
      ))}
    </>
  );
}

function Drawer({ entries, current, onClose, onOpen }: { entries: Entry[]; current?: string; onClose: () => void; onOpen: (t: NavTarget) => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <nav className="drawer" onClick={(e) => e.stopPropagation()} aria-label="Main">
        <div className="drawer-brand">Dash</div>
        <NavLinks entries={entries} current={current} onOpen={onOpen} />
      </nav>
    </div>
  );
}

/** Desktop only: the drawer, always open. */
function Sidebar({ entries, current, onOpen }: { entries: Entry[]; current?: string; onOpen: (t: NavTarget) => void }) {
  return (
    <nav className="sidebar" aria-label="Main">
      <div className="drawer-brand">Dash</div>
      <NavLinks entries={entries} current={current} onOpen={onOpen} />
    </nav>
  );
}



