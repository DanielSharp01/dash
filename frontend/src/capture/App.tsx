import { useCallback, useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import { entriesSnapshot, removeEntry, useEntries } from "../core/entries";
import { followUpCount, undoPoint } from "../core/followUp";
import { itemById, removeFood } from "../core/foods";
import { todayKey } from "../core/time";
import type { Entry } from "../core/types";
import { CookFlow } from "./flows/CookFlow";
import { EatFlow } from "./flows/EatFlow";
import { ExerciseFlow } from "./flows/ExerciseFlow";
import { ActivityRoute, BatchRoute, CatalogueScreen, type CatalogueTab, ComboRoute, ItemRoute, RecipeRoute } from "./screens/Catalogue";
import { GoalsScreen } from "./screens/Goals";
import { SettingsScreen, WeighInsScreen } from "./screens/Profile";
import { type EntryActions, InboxScreen, Today } from "./screens/Today";
import type { Notice, Notify } from "./ui/notify";
import { useOpen } from "./ui/useSteps";

/** The day a page is about: "?day=" when it's a valid past day, otherwise today. */
function useDay(): [string, (d: string) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get("day");
  const day = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) && raw < todayKey() ? raw : todayKey();
  // Paging through days replaces the entry, so back leaves the day view instead of retracing days.
  const setDay = (d: string) => setParams(d === todayKey() ? {} : { day: d }, { replace: true, state: history.state?.usr });
  return [day, setDay];
}

type NavTarget = "today" | "inbox" | "catalogue" | "weighIns" | "goal" | "settings";

const sections: { target: NavTarget; path: string; match: string[]; icon: string; label: string }[] = [
  { target: "today", path: "/", match: ["/"], icon: "📅", label: "Today" },
  { target: "inbox", path: "/follow-up", match: ["/follow-up"], icon: "📥", label: "To follow up" },
  { target: "catalogue", path: "/items", match: ["/items", "/combos", "/recipes", "/activities"], icon: "🗂️", label: "Catalogue" },
  { target: "weighIns", path: "/weigh-ins", match: ["/weigh-ins"], icon: "⚖️", label: "Weigh-ins" },
  { target: "goal", path: "/goal", match: ["/goal"], icon: "🎯", label: "Goal" },
  { target: "settings", path: "/settings", match: ["/settings"], icon: "⚙️", label: "Settings" },
];

export function App() {
  const [toast, setToast] = useState<Notice & { id: number }>();
  const [drawer, setDrawer] = useState(false);
  const entries = useEntries();
  const location = useLocation();
  const open = useOpen();
  const [day, setDay] = useDay();

  const current = sections.find((s) => s.match.some((m) => (m === "/" ? location.pathname === "/" : location.pathname === m)))?.target;

  const notify: Notify = useCallback((message, undo, action) => setToast({ id: Date.now(), message, undo, action }), []);

  const finish = useCallback(
    (saved?: Entry, undo?: () => void) => {
      if (saved) notify(saved.when.date === todayKey() ? "Saved" : `Saved to ${new Date(`${saved.when.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "long" })}`, undo, { label: "Edit", run: () => open(`/entry/${saved.id}/edit`) });
    },
    [notify],
  );

  const remove = (entry: Entry) => {
    const undo = undoPoint();
    removeEntry(entry.id);
    // An unsure item only exists to be followed up through its entries; without any it's noise.
    if (entry.kind === "food")
      for (const line of entry.lines) {
        const item = itemById(line.itemId);
        if (item?.unsure && !entriesSnapshot().some((e) => e.kind === "food" && e.lines.some((l) => l.itemId === item.id))) removeFood(item.id);
      }
    notify("Deleted", undo);
  };

  const actions: EntryActions = {
    onEdit: (e) => open(`/entry/${e.id}/edit`),
    onDuplicate: (e) => open(`/entry/${e.id}/duplicate`),
    onDelete: remove,
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(undefined), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const openMenu = () => setDrawer(true);
  const go = (s: (typeof sections)[number]) => {
    setDrawer(false);
    if (s.target !== current || location.search) open(s.path);
  };

  return (
    <>
      <Routes>
        <Route path="/" element={<Today day={day} setDay={setDay} onMenu={openMenu} actions={actions} />} />
        <Route path="/log/ate" element={<LogFood via="ate" finish={finish} />} />
        <Route path="/log/drank" element={<LogFood via="drank" finish={finish} />} />
        <Route path="/log/exercise" element={<LogExercise finish={finish} />} />
        <Route path="/cook" element={<Cook />} />
        <Route path="/cook/:recipeId" element={<Cook />} />
        <Route path="/entry/:id/:mode" element={<EditEntry finish={finish} />} />
        <Route path="/follow-up" element={<InboxScreen onMenu={openMenu} actions={actions} />} />
        {(["items", "combos", "recipes", "activities"] as CatalogueTab[]).map((tab) => (
          <Route key={tab} path={`/${tab}`} element={<CatalogueScreen tab={tab} onMenu={openMenu} />} />
        ))}
        <Route path="/items/:id" element={<ItemRoute notify={notify} />} />
        <Route path="/combos/:id" element={<ComboRoute notify={notify} />} />
        <Route path="/recipes/:id" element={<RecipeRoute notify={notify} />} />
        <Route path="/recipes/:id/:batchId" element={<BatchRoute notify={notify} />} />
        <Route path="/activities/:id" element={<ActivityRoute notify={notify} />} />
        <Route path="/weigh-ins" element={<WeighInsScreen onMenu={openMenu} notify={notify} />} />
        <Route path="/goal" element={<GoalsScreen onMenu={openMenu} />} />
        <Route path="/settings" element={<SettingsScreen onMenu={openMenu} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {drawer && (
        <Drawer onClose={() => setDrawer(false)}>
          {sections.map((s) => {
            const count = s.target === "inbox" ? followUpCount(entries) : 0;
            return (
              <button key={s.target} className="drawer-link" aria-current={current === s.target ? "page" : undefined} onClick={() => go(s)}>
                <span aria-hidden>{s.icon}</span>
                {s.label}
                {count > 0 && <span className="badge badge-warn">{count}</span>}
              </button>
            );
          })}
        </Drawer>
      )}

      {toast && (
        <div className="toast" role="status" key={toast.id}>
          <span>{toast.message}</span>
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
          {toast.action && (
            <button
              onClick={() => {
                toast.action!.run();
                setToast(undefined);
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </>
  );
}

function Drawer({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <nav className="drawer" onClick={(e) => e.stopPropagation()} aria-label="Main">
        <div className="drawer-brand">Dash</div>
        {children}
      </nav>
    </div>
  );
}

type Finish = (saved?: Entry, undo?: () => void) => void;

function LogFood({ via, finish }: { via: "ate" | "drank"; finish: Finish }) {
  const [day] = useDay();
  const foodId = (useLocation().state as { foodId?: string } | null)?.foodId;
  return <EatFlow key={via} via={via} date={day} mode={{ kind: "new", foodId }} onDone={finish} />;
}

function LogExercise({ finish }: { finish: Finish }) {
  const [day] = useDay();
  return <ExerciseFlow date={day} onDone={finish} />;
}

function Cook() {
  const { recipeId } = useParams();
  const navigate = useNavigate();
  return (
    <CookFlow
      key={recipeId ?? "new"}
      recipeId={recipeId}
      onDone={(recipe) => recipe && navigate("/log/ate", { replace: true, state: { foodId: recipe.id } })}
    />
  );
}

/** Edit or log again by id; one that no longer exists goes back to the day view. */
function EditEntry({ finish }: { finish: Finish }) {
  const { id, mode } = useParams();
  const entry = useEntries().find((e) => e.id === id);
  if (!entry || (mode !== "edit" && mode !== "duplicate")) return <Navigate to="/" replace />;
  return entry.kind === "food" ? (
    <EatFlow key={`${mode}-${id}`} via={entry.via} date={entry.when.date} mode={{ kind: mode, entry }} onDone={finish} />
  ) : (
    <ExerciseFlow key={`${mode}-${id}`} date={entry.when.date} mode={{ kind: mode, entry }} onDone={finish} />
  );
}
