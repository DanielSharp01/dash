import { useCallback, useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import type { Entry } from "@dash/core";
import { deleteEntry, restoreEntry, useDayEntries, useFollowUpCount } from "../queries/entries.queries";
import { useMe } from "../queries/me.queries";
import { dayParam, todayKey } from "./time";
import { CookFlow } from "./flows/CookFlow";
import { EatFlow } from "./flows/EatFlow";
import { ExerciseFlow } from "./flows/ExerciseFlow";
import { ActivityRoute, BatchRoute, CatalogueScreen, type CatalogueTab, ComboRoute, ItemRoute, RecipeRoute } from "./screens/Catalogue";
import { GoalsScreen } from "./screens/Goals";
import { SettingsScreen, WeighInsScreen } from "./screens/Profile";
import { type EntryActions, InboxScreen, Today } from "./screens/Today";
import { Drawer } from "./ui/Drawer";
import { RecapHost } from "./ui/RecapHost";
import { dismiss, notify, useNotice } from "./ui/notify";
import { UpdateBar } from "./ui/UpdateBar";
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
  // Days and times need the person's rollover hour, so nothing renders before /me is in.
  useMe();
  const toast = useNotice();
  const [drawer, setDrawer] = useState(false);
  const followUpCount = useFollowUpCount();
  const location = useLocation();
  const open = useOpen();
  const [day, setDay] = useDay();

  const current = sections.find((s) => s.match.some((m) => (m === "/" ? location.pathname === "/" : location.pathname === m)))?.target;

  const finish = useCallback((saved?: Entry, undo?: () => void) => {
    if (saved)
      notify(saved.when.date === todayKey() ? "Saved" : `Saved to ${new Date(`${saved.when.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "long" })}`, undo, {
        label: "Edit",
        run: () => open(`/entry/${saved.id}/edit${dayParam(saved.when.date)}`),
      });
  }, []);

  const remove = (entry: Entry) => {
    void deleteEntry(entry);
    notify("Deleted", () => void restoreEntry(entry.id));
  };

  const actions: EntryActions = {
    onEdit: (e) => open(`/entry/${e.id}/edit${dayParam(e.when.date)}`),
    onDuplicate: (e) => open(`/entry/${e.id}/duplicate${dayParam(e.when.date)}`),
    onDelete: remove,
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(dismiss, 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const openMenu = () => setDrawer(true);
  const go = (s: (typeof sections)[number]) => {
    setDrawer(false);
    if (s.target !== current || location.search) open(s.path);
  };

  return (
    <>
      <UpdateBar />
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
        <Route path="/items/:id" element={<ItemRoute />} />
        <Route path="/combos/:id" element={<ComboRoute />} />
        <Route path="/recipes/:id" element={<RecipeRoute />} />
        <Route path="/recipes/:id/:batchId" element={<BatchRoute />} />
        <Route path="/activities/:id" element={<ActivityRoute />} />
        <Route path="/weigh-ins" element={<WeighInsScreen onMenu={openMenu} />} />
        <Route path="/goal" element={<GoalsScreen onMenu={openMenu} />} />
        <Route path="/settings" element={<SettingsScreen onMenu={openMenu} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <RecapHost />

      <Drawer open={drawer} onOpenChange={setDrawer} swipeToOpen={current !== undefined}>
        {sections.map((s) => {
          const count = s.target === "inbox" ? followUpCount : 0;
          return (
            <button key={s.target} className="drawer-link" aria-current={current === s.target ? "page" : undefined} onClick={() => go(s)}>
              <span aria-hidden>{s.icon}</span>
              {s.label}
              {count > 0 && <span className="badge badge-warn">{count}</span>}
            </button>
          );
        })}
      </Drawer>

      {toast && (
        <div className="toast" role="status" key={toast.id}>
          <span>{toast.message}</span>
          {toast.undo && (
            <button
              onClick={() => {
                toast.undo!();
                dismiss();
              }}
            >
              Undo
            </button>
          )}
          {toast.action && (
            <button
              onClick={() => {
                toast.action!.run();
                dismiss();
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

/** Edit or log again by id, found on its day; one that no longer exists goes back to the day view. */
function EditEntry({ finish }: { finish: Finish }) {
  const { id, mode } = useParams();
  const [day] = useDay();
  const { data, isPending } = useDayEntries(day);
  if (isPending) return null;
  const entry = data?.find((e) => e.id === id);
  if (!entry || (mode !== "edit" && mode !== "duplicate")) return <Navigate to="/" replace />;
  return entry.kind === "food" ? (
    <EatFlow key={`${mode}-${id}`} via={entry.via} date={entry.when.date} mode={{ kind: mode, entry }} onDone={finish} />
  ) : (
    <ExerciseFlow key={`${mode}-${id}`} date={entry.when.date} mode={{ kind: mode, entry }} onDone={finish} />
  );
}
