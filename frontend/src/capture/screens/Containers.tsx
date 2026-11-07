import { type ReactNode, useEffect, useState } from "react";
import { Navigate, useParams } from "react-router";
import type { Container, ContainerKind } from "@dash/core";
import { addContainer, removeContainer, updateContainer } from "../../queries/containers.queries";
import { useMe } from "../../queries/me.queries";
import { FlowShell } from "../ui/FlowShell";
import { notify } from "../ui/notify";
import { NumberInput } from "../ui/NumberInput";
import { Question } from "../ui/Question";
import { useOpen, useSteps } from "../ui/useSteps";

const kinds: Record<ContainerKind, { heading: string; hint: string; add: string; noun: string; placeholder: string }> = {
  pot: { heading: "Pots & pans", hint: "Their empty weight comes off when you weigh a finished dish in them.", add: "Add a pot", noun: "pot", placeholder: "e.g. Big pot" },
  glass: { heading: "Mugs & glasses", hint: "Their empty weight and how much they hold, for logging drinks later.", add: "Add a mug or glass", noun: "mug or glass", placeholder: "e.g. Big mug" },
};
const isKind = (k: string | undefined): k is ContainerKind => !!k && k in kinds;

type Field = "name" | "weight" | "capacity";
type Fields = { name: string; grams?: number; capacityMl?: number };

const formatGrams = (g: number) => `${g.toLocaleString()} g`;
const formatMl = (ml: number) => `${ml.toLocaleString()} ml`;
const positive = (n?: number) => n !== undefined && n > 0;

const fieldsOf = (c: Container): Fields => ({ name: c.name, grams: c.grams, capacityMl: c.kind === "glass" ? c.capacityMl : undefined });
const sameFields = (a: Fields, b: Fields) => a.name.trim() === b.name.trim() && a.grams === b.grams && a.capacityMl === b.capacityMl;

function build(kind: ContainerKind, id: string, f: Fields): Container {
  const name = f.name.trim();
  if (kind === "pot") return { id, kind, name, grams: f.grams! };
  return { id, kind, name, ...(f.grams !== undefined && { grams: f.grams }), ...(f.capacityMl !== undefined && { capacityMl: f.capacityMl }) };
}

function describe(c: Container) {
  if (c.kind === "pot") return formatGrams(c.grams);
  return [c.capacityMl !== undefined && formatMl(c.capacityMl), c.grams !== undefined && formatGrams(c.grams)].filter(Boolean).join(" · ");
}

/** What food and drink get weighed in, a section per kind. */
export function ContainersScreen({ onMenu }: { onMenu: () => void }) {
  const { close } = useSteps<"list">("list");
  const open = useOpen();
  const { containers } = useMe();
  return (
    <FlowShell title="Containers" canGoBack={false} onBack={close} onClose={close} onMenu={onMenu}>
      {(["pot", "glass"] as const).map((kind) => (
        <section key={kind}>
          <h2 className="list-heading">{kinds[kind].heading}</h2>
          <p className="hint">{kinds[kind].hint}</p>
          <ul className="list">
            {containers
              .filter((c) => c.kind === kind)
              .map((c) => (
                <ValueRow key={c.id} label={c.name} value={describe(c)} onOpen={() => open(`/containers/${c.id}`)} />
              ))}
            <li>
              <button className="row row-create" onClick={() => open(`/containers/new/${kind}`)}>
                <span className="row-main">
                  <span className="row-title">＋ {kinds[kind].add}</span>
                </span>
              </button>
            </li>
          </ul>
        </section>
      ))}
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

export function NewContainerRoute() {
  const { kind } = useParams();
  if (!isKind(kind)) return <Navigate to="/containers" replace />;
  return <NewContainer key={kind} kind={kind} />;
}

/** One question a page. A mug or glass may skip its weight, but then needs its capacity. */
function NewContainer({ kind }: { kind: ContainerKind }) {
  const { step, go, back, replace, close } = useSteps<Field>("name", undefined, "/containers");
  const [fields, setFields] = useState<Fields>({ name: "" });
  const set = (patch: Partial<Fields>) => setFields((f) => ({ ...f, ...patch }));
  const title = `New ${kinds[kind].noun}`;

  // A reload keeps the step in history but not the typed name, so start over.
  useEffect(() => {
    if (step !== "name" && !fields.name.trim()) replace("name");
  }, []);

  const save = () => {
    void addContainer(build(kind, crypto.randomUUID(), fields));
    close();
  };

  if (step === "weight") {
    const last = kind === "pot";
    return (
      <WeightQuestion
        title={title}
        grams={fields.grams}
        onChange={(grams) => set({ grams })}
        optional={!last}
        action={last ? "Save" : fields.grams === undefined ? "Skip" : "Next"}
        onBack={back}
        onDone={last ? save : () => go("capacity")}
      />
    );
  }
  if (step === "capacity") {
    return <CapacityQuestion title={title} capacityMl={fields.capacityMl} onChange={(capacityMl) => set({ capacityMl })} optional={fields.grams !== undefined} action="Save" onBack={back} onDone={save} />;
  }
  return <NameQuestion title={title} name={fields.name} placeholder={kinds[kind].placeholder} onChange={(name) => set({ name })} action="Next" onBack={close} onDone={() => go("weight")} />;
}

export function ContainerRoute() {
  const { id } = useParams();
  const container = useMe().containers.find((c) => c.id === id);
  if (!container) return <Navigate to="/containers" replace />;
  return <ContainerPage key={container.id} container={container} />;
}

/** Each value is a row opening its own question; Done saves, back leaves it as it was. */
function ContainerPage({ container }: { container: Container }) {
  const { step, go, back, close } = useSteps<"rows" | Field>("rows", undefined, "/containers");
  const [draft, setDraft] = useState(() => fieldsOf(container));
  const set = (patch: Partial<Fields>) => setDraft((d) => ({ ...d, ...patch }));
  const glass = container.kind === "glass";
  const edit = (field: Field) => {
    setDraft(fieldsOf(container));
    go(field);
  };
  const save = () => {
    if (!sameFields(draft, fieldsOf(container))) void updateContainer(build(container.kind, container.id, draft));
    back();
  };
  const remove = () => {
    close();
    void removeContainer(container);
    // Deleted rows can't be restored, so undo adds it again under a new id; nothing points at a container.
    notify(`Deleted ${container.name}`, () => void addContainer({ ...container, id: crypto.randomUUID() }));
  };

  const page = { title: container.name, action: "Done" as const, onBack: back, onDone: save };
  if (step === "name") return <NameQuestion {...page} name={draft.name} placeholder={kinds[container.kind].placeholder} onChange={(name) => set({ name })} />;
  if (step === "weight") return <WeightQuestion {...page} grams={draft.grams} onChange={(grams) => set({ grams })} optional={glass && draft.capacityMl !== undefined} />;
  if (step === "capacity") return <CapacityQuestion {...page} capacityMl={draft.capacityMl} onChange={(capacityMl) => set({ capacityMl })} optional={draft.grams !== undefined} />;
  const { grams, capacityMl } = fieldsOf(container);
  return (
    <FlowShell title={container.name} canGoBack onBack={close} onClose={close}>
      <ul className="list">
        <ValueRow label="Name" value={container.name} onOpen={() => edit("name")} />
        <ValueRow label="Empty weight" value={grams !== undefined ? formatGrams(grams) : "Not set"} onOpen={() => edit("weight")} />
        {glass && <ValueRow label="Capacity" value={capacityMl !== undefined ? formatMl(capacityMl) : "Not set"} onOpen={() => edit("capacity")} />}
      </ul>
      <button className="link-btn danger" onClick={remove}>
        Delete {kinds[container.kind].noun}
      </button>
    </FlowShell>
  );
}

type QuestionPageProps = { title: string; action: "Next" | "Skip" | "Save" | "Done"; onBack: () => void; onDone: () => void };

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

function NameQuestion({ name, placeholder, onChange, ...page }: QuestionPageProps & { name: string; placeholder: string; onChange: (name: string) => void }) {
  return (
    <QuestionPage {...page} question="What's it called?" valid={name.trim() !== ""}>
      <input className="text-input name-entry" autoFocus enterKeyHint={page.action === "Next" ? "next" : "done"} placeholder={placeholder} value={name} onChange={(e) => onChange(e.target.value)} />
    </QuestionPage>
  );
}

type NumberQuestionProps = QuestionPageProps & { optional: boolean };

/** Optional numbers may be left empty; a typed one must still be above zero. */
function NumberQuestion({ question, hint, unit, value, onChange, optional, ...page }: NumberQuestionProps & { question: string; hint: string; unit: string; value?: number; onChange: (n?: number) => void }) {
  return (
    <QuestionPage {...page} question={question} hint={optional ? [hint, "Leave it empty if you don't know."] : [hint]} valid={positive(value) || (optional && value === undefined)}>
      <label className="kcal-field">
        <NumberInput integer autoFocus enterKeyHint={page.action === "Next" || page.action === "Skip" ? "next" : "done"} placeholder="–" value={value} onChange={onChange} />
        <span>{unit}</span>
      </label>
    </QuestionPage>
  );
}

function WeightQuestion({ grams, ...props }: NumberQuestionProps & { grams?: number; onChange: (grams?: number) => void }) {
  return <NumberQuestion {...props} question="How much does it weigh empty?" hint="Weigh it with nothing in it." unit="g" value={grams} />;
}

function CapacityQuestion({ capacityMl, ...props }: NumberQuestionProps & { capacityMl?: number; onChange: (ml?: number) => void }) {
  return <NumberQuestion {...props} question="How much does it hold?" hint="As full as you usually fill it." unit="ml" value={capacityMl} />;
}
