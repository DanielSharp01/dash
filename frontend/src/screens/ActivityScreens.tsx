import { useMemo, useState } from "react";
import { Navigate, useLocation, useParams } from "react-router";
import { ActivityEditor } from "../components/ActivityEditor";
import { FlowShell } from "../components/FlowShell";
import { TrashIcon } from "../components/TrashIcon";
import { useOpen, useSteps } from "../components/useSteps";
import { burnBasisLabel, defaultBurn } from "../data/burn";
import { activityById, allActivities } from "../data/catalogue";
import { setMyActivities, toggleMyActivity, useMyActivities } from "../data/myActivities";
import { storedEntries } from "../data/store";
import type { Activity } from "../data/types";
import { removeUserActivity, saveUserActivity, userActivities, useUserActivities } from "../data/userActivities";
import type { Notify } from "./ItemScreens";

/** Used ones and built-ins are hidden rather than removed; built-ins live in code, so hiding is the only option. Returns an undo. */
function deleteActivity(a: Activity): () => void {
  const stored = userActivities().find((x) => x.id === a.id);
  const used = storedEntries().some((e) => e.kind === "exercise" && e.activityId === a.id);
  if (used || a.library) saveUserActivity({ ...a, deleted: true });
  else removeUserActivity(a.id);
  return () => (stored ? saveUserActivity(stored) : removeUserActivity(a.id));
}

const duplicateActivity = (a: Activity): Activity => ({ ...a, id: crypto.randomUUID(), name: `${a.name} (copy)`, library: undefined, imports: undefined });

const blankActivity = (name = ""): Activity => ({ id: crypto.randomUUID(), name, icon: "🏃", measures: ["duration"], burn: defaultBurn.duration });

/** Same URL scheme as items: an id, "new", or "<id>/duplicate". */
function resolveActivityDetail(detail: string, name?: string): Activity | undefined {
  if (detail === "new") return blankActivity(name);
  const copy = detail.match(/^(.+)\/duplicate$/);
  if (copy) {
    const source = activityById(copy[1]);
    return source && duplicateActivity(source);
  }
  return activityById(detail);
}

export function ActivityDetailRoute({ notify }: { notify: Notify }) {
  const params = useParams();
  const location = useLocation();
  const detail = params.dup ? `${params.id}/duplicate` : params.id!;
  // One resolve per history entry, so a new activity keeps its id while being edited.
  const activity = useMemo(() => resolveActivityDetail(detail, (location.state as { name?: string } | null)?.name), [location.key]);
  const { close } = useSteps("edit", undefined, "/activities");
  const mine = useMyActivities() ?? [];
  useUserActivities();

  if (!activity) return <Navigate to="/activities" replace />;
  const existing = activityById(activity.id);
  return (
    <FlowShell title={existing ? "Edit activity" : "New activity"} canGoBack onBack={close} onClose={close}>
      <ActivityEditor
        key={activity.id}
        // Publishing keeps the editor open, so it must see the stored flag, or saving would unpublish.
        activity={existing?.library ? { ...activity, library: true } : activity}
        onPublish={
          existing && !existing.library
            ? () => {
                if (!confirm(`Publish “${existing.name}” to the library? It can't be moved back to your activities.`)) return;
                saveUserActivity({ ...existing, library: true });
                notify(`${existing.name} is in the library`);
              }
            : undefined
        }
        onSave={(saved) => {
          const previous = userActivities().find((a) => a.id === saved.id);
          const wasMine = mine.includes(saved.id);
          saveUserActivity(saved);
          if (!wasMine) setMyActivities([...mine, saved.id]);
          notify(`Saved ${saved.name}`, () => {
            if (previous) saveUserActivity(previous);
            else removeUserActivity(saved.id);
            if (!wasMine) setMyActivities(mine);
          });
          close();
        }}
      />
    </FlowShell>
  );
}

export function ActivitiesScreen({ onMenu, notify }: { onMenu: () => void; notify: Notify }) {
  const { close } = useSteps("list");
  const open = useOpen();
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string>();
  const mine = useMyActivities() ?? [];
  useUserActivities();

  const q = query.trim().toLowerCase();
  const shown = allActivities().filter((a) => !q || a.name.toLowerCase().includes(q));
  const sections = [
    { title: "Your activities", list: shown.filter((a) => !a.library) },
    { title: "Library", list: shown.filter((a) => a.library) },
  ].filter((s) => s.list.length);

  return (
    <FlowShell title="Activities" canGoBack={false} onBack={close} onClose={close} onMenu={onMenu}>
      <div className="search-bar">
        <input type="search" placeholder="Search activities" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <button className="row row-create" onClick={() => open("/activities/new", { name: query.trim() })}>
        <span className="row-icon">＋</span>
        <span className="row-main">
          <span className="row-title">{q ? `New activity “${query.trim()}”` : "New activity"}</span>
        </span>
      </button>
      <p className="hint">Starred ones show first when you log exercise.</p>
      {sections.map((s) => (
        <section key={s.title}>
          <h2 className="list-heading">{s.title}</h2>
          <ul className="list">
            {s.list.map((a) => {
              const isOpen = expanded === a.id;
              const starred = mine.includes(a.id);
              return (
                <li key={a.id} className={`item-li ${isOpen ? "open" : ""}`}>
                  <div className="catalogue-row">
                    <button className="row" aria-expanded={isOpen} onClick={() => setExpanded(isOpen ? undefined : a.id)}>
                      <span className="row-icon">{a.icon}</span>
                      <span className="row-main">
                        <span className="row-title">{a.name}</span>
                        <span className="row-sub">{a.burn ? `Calories from ${burnBasisLabel[a.burn.basis].toLowerCase()}` : "Calories entered by hand"}</span>
                      </span>
                    </button>
                    <button
                      className={`star-btn ${starred ? "starred" : ""}`}
                      aria-pressed={starred}
                      aria-label={starred ? `Unstar ${a.name}` : `Star ${a.name}`}
                      onClick={() => toggleMyActivity(a.id)}
                    >
                      {starred ? "★" : "☆"}
                    </button>
                  </div>
                  {isOpen && (
                    <div className="entry-actions item-actions">
                      <button className="btn btn-small" onClick={() => open(`/activities/${a.id}`)}>
                        ✏️ Edit
                      </button>
                      <button className="btn btn-small" onClick={() => open(`/activities/${a.id}/duplicate`)}>
                        ⧉ Duplicate
                      </button>
                      <button
                        className="row-action trash-btn"
                        aria-label={`Delete ${a.name}`}
                        title="Delete"
                        onClick={() => {
                          setExpanded(undefined);
                          notify(`Deleted ${a.name}`, deleteActivity(a));
                        }}
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </FlowShell>
  );
}
