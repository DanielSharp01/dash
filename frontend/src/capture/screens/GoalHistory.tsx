import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router";
import { type AreaValue, BEGINNING, type Dated, type Plan, planAreaValue, planAt } from "@dash/core";
import { saveAreaVersions, useMe } from "../../queries/me.queries";
import { todayKey } from "../time";
import { DateButton } from "../ui/DateButton";
import { FlowShell } from "../ui/FlowShell";
import { notify } from "../ui/notify";
import { useSteps } from "../ui/useSteps";
import { AreaFields, areas, describeArea, type GoalArea, isArea } from "./Goals";

type Version = Dated<AreaValue<GoalArea>>;
/** A version by its start, or a new one. */
type Editing = { isNew: false; from: string } | { isNew: true };

const shortDate = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
const oldestFirst = (versions: Version[]) => [...versions].sort((a, b) => (a.from < b.from ? -1 : 1));

export function GoalHistoryRoute() {
  const { area } = useParams();
  if (!isArea(area)) return <Navigate to="/progress" replace />;
  return <GoalHistory key={area} area={area} />;
}

/**
 * An area's versions, newest first. Each stays editable and past days follow, so a correction
 * leaves no record. The oldest is the start: its values change, but it can't move or go.
 */
function GoalHistory({ area }: { area: GoalArea }) {
  const { step, go, back, replace, close } = useSteps<"list" | "edit">("list", undefined, `/progress/${area}`);
  const { plan: history } = useMe();
  const versions: Version[] = history[area];
  const [editing, setEditing] = useState<Editing>();

  // A reload keeps the step in history but not which version was open, so go back to the list.
  useEffect(() => {
    if (step === "edit" && !editing) replace("list");
  }, []);

  const saveWithUndo = (next: Version[], message: string) => {
    const before = versions;
    void saveAreaVersions(area, next);
    notify(message, () => void saveAreaVersions(area, before));
  };
  const move = (v: Version, date: string) => {
    if (date === v.from) return;
    const replaced = versions.find((x) => x.from === date);
    const next = oldestFirst([...versions.filter((x) => x !== v && x !== replaced), { ...v, from: date }]);
    saveWithUndo(next, replaced ? `Moved to ${shortDate(date)}, replacing the change there` : `Moved to ${shortDate(date)}`);
  };
  const open = (target: Editing) => {
    setEditing(target);
    go("edit");
  };

  if (step === "edit" && editing) {
    return (
      <EditVersion
        area={area}
        editing={editing}
        versions={versions}
        onBack={back}
        onSave={(from, value) => {
          const next = editing.isNew ? oldestFirst([...versions.filter((x) => x.from !== from), { from, value }]) : versions.map((x) => (x.from === from ? { from, value } : x));
          void saveAreaVersions(area, next);
          back();
        }}
      />
    );
  }

  return (
    <FlowShell title={`${areas[area].title} history`} canGoBack onBack={close} onClose={close}>
      <ul className="list">
        <li>
          <button className="row row-create" onClick={() => open({ isNew: true })}>
            <span className="row-icon">＋</span>
            <span className="row-main">
              <span className="row-title">Add a change from a date</span>
            </span>
          </button>
        </li>
        {[...versions].reverse().map((v) => (
          <li key={v.from} className="weigh-row">
            <span className="weigh-date">
              {v.from === BEGINNING ? <span className="history-start">From the start</span> : <DateButton prefix="From" value={v.from} max={todayKey()} onChange={(date) => move(v, date)} />}
            </span>
            <button className="history-value" onClick={() => open({ isNew: false, from: v.from })}>
              {describeArea(area, planAt(history, v.from))}
            </button>
            {v.from !== BEGINNING && (
              <button className="icon-btn small" aria-label="Delete this change" onClick={() => saveWithUndo(versions.filter((x) => x !== v), "Deleted")}>
                ✕
              </button>
            )}
          </li>
        ))}
      </ul>
    </FlowShell>
  );
}

/** A version's values with the area's usual fields; a new one also picks the day it starts. */
function EditVersion({
  area,
  editing,
  versions,
  onBack,
  onSave,
}: {
  area: GoalArea;
  editing: Editing;
  versions: Version[];
  onBack: () => void;
  onSave: (from: string, value: AreaValue<GoalArea>) => void;
}) {
  const { plan: history } = useMe();
  const isNew = editing.isNew;
  const [from, setFrom] = useState(editing.isNew ? todayKey() : editing.from);
  const [draft, setDraft] = useState<Plan>(() => planAt(history, from));
  const update = (patch: Partial<Plan>) => setDraft((d) => ({ ...d, ...patch }));
  const save = () => onSave(from, planAreaValue(area, draft));
  const replaces = isNew && versions.some((v) => v.from === from);

  return (
    <FlowShell
      title={areas[area].title}
      subtitle={isNew ? "New change" : from === BEGINNING ? "From the start" : `From ${shortDate(from)}`}
      canGoBack
      onBack={onBack}
      onClose={onBack}
      footer={
        <button className="btn btn-primary btn-block" onClick={save}>
          Save
        </button>
      }
    >
      {isNew && (
        <div className="field">
          <DateButton prefix="From" value={from} max={todayKey()} onChange={setFrom} />
          {replaces && <p className="hint">Replaces the change already on that day.</p>}
        </div>
      )}
      <AreaFields area={area} draft={draft} update={update} onSubmit={save} />
    </FlowShell>
  );
}
