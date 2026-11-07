import { type ReactNode, useEffect, useState } from "react";
import { Navigate, useParams } from "react-router";
import type { Pot } from "@dash/core";
import { useMe } from "../../queries/me.queries";
import { addPot, removePot, updatePot } from "../../queries/pots.queries";
import { FlowShell } from "../ui/FlowShell";
import { notify } from "../ui/notify";
import { NumberInput } from "../ui/NumberInput";
import { Question } from "../ui/Question";
import { useOpen, useSteps } from "../ui/useSteps";

const formatGrams = (g: number) => `${g.toLocaleString()} g`;

/** What food and drink get weighed in; glasses and other containers with a capacity join the pots here. */
export function ContainersScreen({ onMenu }: { onMenu: () => void }) {
  const { close } = useSteps<"list">("list");
  const open = useOpen();
  const { pots } = useMe();
  return (
    <FlowShell
      title="Containers"
      canGoBack={false}
      onBack={close}
      onClose={close}
      onMenu={onMenu}
      footer={
        <button className="btn btn-primary btn-block" onClick={() => open("/containers/new")}>
          Add a pot
        </button>
      }
    >
      <h2 className="list-heading">Pots &amp; pans</h2>
      <p className="hint">Their empty weight comes off when you weigh a finished dish in them.</p>
      {pots.length > 0 && (
        <ul className="list">
          {pots.map((p) => (
            <ValueRow key={p.id} label={p.name} value={formatGrams(p.grams)} onOpen={() => open(`/containers/${p.id}`)} />
          ))}
        </ul>
      )}
    </FlowShell>
  );
}

function ValueRow({ label, value, onOpen }: { label: string; value: string; onOpen: () => void }) {
  return (
    <li>
      <button className="row" onClick={onOpen}>
        <span className="row-main">
          <span className="row-title">{label}</span>
        </span>
        <span className="row-value">{value}</span>
        <span className="row-chevron">›</span>
      </button>
    </li>
  );
}

/** One question a page: the name, then the empty weight. */
export function NewPotRoute() {
  const { step, go, back, replace, close } = useSteps<"name" | "weight">("name", undefined, "/containers");
  const [name, setName] = useState("");
  const [grams, setGrams] = useState<number>();

  // A reload keeps the step in history but not the typed name, so start over.
  useEffect(() => {
    if (step === "weight" && !name.trim()) replace("name");
  }, []);

  if (step === "weight") {
    return (
      <WeightQuestion
        title="New pot"
        grams={grams}
        onChange={setGrams}
        action="Save"
        onBack={back}
        onDone={() => {
          void addPot({ id: crypto.randomUUID(), name: name.trim(), grams: grams! });
          close();
        }}
      />
    );
  }
  return <NameQuestion title="New pot" name={name} onChange={setName} action="Next" onBack={close} onDone={() => go("weight")} />;
}

export function PotRoute() {
  const { id } = useParams();
  const pot = useMe().pots.find((p) => p.id === id);
  if (!pot) return <Navigate to="/containers" replace />;
  return <PotPage key={pot.id} pot={pot} />;
}

/** Its name and weight as rows, each opening its own question; Done saves, back leaves it as it was. */
function PotPage({ pot }: { pot: Pot }) {
  const { step, go, back, close } = useSteps<"pot" | "name" | "weight">("pot", undefined, "/containers");
  const [draft, setDraft] = useState(pot);
  const edit = (field: "name" | "weight") => {
    setDraft(pot);
    go(field);
  };
  const save = () => {
    const changed = { ...draft, name: draft.name.trim() };
    if (changed.name !== pot.name || changed.grams !== pot.grams) void updatePot(changed);
    back();
  };
  const remove = () => {
    close();
    void removePot(pot);
    // Deleted rows can't be restored, so undo adds it again as a new pot; nothing points at a pot.
    notify(`Deleted ${pot.name}`, () => void addPot({ ...pot, id: crypto.randomUUID() }));
  };

  if (step === "name") return <NameQuestion title={pot.name} name={draft.name} onChange={(name) => setDraft({ ...draft, name })} action="Done" onBack={back} onDone={save} />;
  if (step === "weight") return <WeightQuestion title={pot.name} grams={draft.grams} onChange={(grams) => setDraft({ ...draft, grams: grams ?? 0 })} action="Done" onBack={back} onDone={save} />;
  return (
    <FlowShell title={pot.name} canGoBack onBack={close} onClose={close}>
      <ul className="list">
        <ValueRow label="Name" value={pot.name} onOpen={() => edit("name")} />
        <ValueRow label="Empty weight" value={formatGrams(pot.grams)} onOpen={() => edit("weight")} />
      </ul>
      <button className="link-btn danger" onClick={remove}>
        Delete pot
      </button>
    </FlowShell>
  );
}

type QuestionPageProps = { title: string; action: "Next" | "Save" | "Done"; onBack: () => void; onDone: () => void };

/** The keyboard's Go does what the pinned button does. */
function QuestionPage({
  title,
  action,
  valid,
  question,
  hint,
  onBack,
  onDone,
  children,
}: QuestionPageProps & { valid: boolean; question: string; hint?: string[]; children: ReactNode }) {
  const submit = () => valid && onDone();
  return (
    <FlowShell
      title={title}
      canGoBack
      onBack={onBack}
      onClose={onBack}
      footer={
        <button className="btn btn-primary btn-block" disabled={!valid} onClick={submit}>
          {action}
        </button>
      }
    >
      <Question title={question} hint={hint}>
        <form
          className="big-entry"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {children}
        </form>
      </Question>
    </FlowShell>
  );
}

function NameQuestion({ name, onChange, ...page }: QuestionPageProps & { name: string; onChange: (name: string) => void }) {
  return (
    <QuestionPage {...page} question="What's it called?" valid={name.trim() !== ""}>
      <input className="text-input name-entry" autoFocus enterKeyHint={page.action === "Next" ? "next" : "done"} placeholder="e.g. Big pot" value={name} onChange={(e) => onChange(e.target.value)} />
    </QuestionPage>
  );
}

function WeightQuestion({ grams, onChange, ...page }: QuestionPageProps & { grams?: number; onChange: (grams?: number) => void }) {
  return (
    <QuestionPage {...page} question="How much does it weigh empty?" hint={["Weigh it with nothing in it."]} valid={!!grams && grams > 0}>
      <label className="kcal-field">
        <NumberInput integer autoFocus enterKeyHint="done" placeholder="–" value={grams} onChange={onChange} />
        <span>g</span>
      </label>
    </QuestionPage>
  );
}
