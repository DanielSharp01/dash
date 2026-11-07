import { type ReactNode, useEffect, useState } from "react";
import { ageOn, BEGINNING, bodyKgAt, dailyTargets, metabolismPresets, type Plan, type PlanArea, planAt, splitPlanVersions } from "@dash/core";
import { markSetupOffered, saveProfile, savePlan, useMe } from "../../queries/me.queries";
import { addWeighIn, useWeighIns } from "../../queries/weighIns.queries";
import { ADULT_AGE } from "../body";
import { todayKey } from "../time";
import { BirthdayInput, HeightInput, sexChoices, sexHint, WeightInput } from "../ui/BodyInputs";
import { FlowShell } from "../ui/FlowShell";
import { Choices, Question } from "../ui/Question";
import { useSteps } from "../ui/useSteps";
import { Budget, FluidFields, GoalFields, MacroFields } from "./Goals";
import { type SetupStep as Step, setupSteps as steps, useSetupProgress } from "./setupProgress";
import { BmiBadge } from "./Weight";

const titles: Record<Step, string> = {
  age: "About you",
  sex: "About you",
  height: "About you",
  weight: "About you",
  goal: "Your goal",
  metabolism: "Your day",
  macros: "Macros",
  fluid: "Fluid intake",
};

/**
 * A new account's goals, one task a page: what the budget needs to know about you, then each goal
 * area. Each step saves as you move on, so leaving keeps what's done and coming back starts at the
 * first step left.
 */
export function SetupRoute() {
  const { left } = useSetupProgress();
  // Where it starts is decided once; finishing a step's fields mustn't move the page before Next.
  const [start] = useState(left[0] ?? steps[0]);
  const { step, depth, go, back, replace, close } = useSteps<Step>(start, undefined, "/goal");
  useEffect(() => markSetupOffered(), []);
  const index = steps.indexOf(step);
  const next = () => (index < steps.length - 1 ? go(steps[index + 1]!) : close());
  // Resumed partway, there's no history entry for the step before, so stepping back swaps to it.
  const previous = () => (depth > 1 ? back() : replace(steps[index - 1]!));
  const shell = { step, index, onBack: index > 0 ? previous : close, onLater: close };

  switch (step) {
    case "age":
      return <AgeStep shell={shell} onNext={next} />;
    case "sex":
      return <SexStep shell={shell} onNext={next} />;
    case "height":
      return <HeightStep shell={shell} onNext={next} />;
    case "weight":
      return <WeightStep shell={shell} onNext={next} />;
    default:
      return <PlanStep key={step} area={step} shell={shell} onNext={next} />;
  }
}

type ShellProps = { step: Step; index: number; onBack: () => void; onLater: () => void };

function SetupShell({ shell, next, children }: { shell: ShellProps; next: { disabled?: boolean; onClick: () => void }; children: ReactNode }) {
  return (
    <FlowShell
      title={titles[shell.step]}
      subtitle={`Setting up · ${shell.index + 1} of ${steps.length}`}
      canGoBack={shell.index > 0}
      onBack={shell.onBack}
      onClose={shell.onLater}
      actions={
        shell.index > 0 && (
          <button className="link-btn" onClick={shell.onLater}>
            Later
          </button>
        )
      }
      footer={
        <button className="btn btn-primary btn-block" disabled={next.disabled} onClick={next.onClick}>
          {shell.index === steps.length - 1 ? "Finish" : "Next"}
        </button>
      }
    >
      {children}
    </FlowShell>
  );
}

function AgeStep({ shell, onNext }: { shell: ShellProps; onNext: () => void }) {
  const { profile } = useMe();
  return (
    <SetupShell shell={shell} next={{ disabled: !profile.birthday, onClick: onNext }}>
      <Question title="How old are you?">
        <BirthdayInput value={profile.birthday} onChange={(birthday) => birthday && void saveProfile({ birthday })} />
      </Question>
    </SetupShell>
  );
}

/** Picking an answer is the whole step, so it moves on by itself. */
function SexStep({ shell, onNext }: { shell: ShellProps; onNext: () => void }) {
  const { profile } = useMe();
  const answered = !!profile.heightCm || !!profile.sex;
  return (
    <SetupShell shell={shell} next={{ onClick: onNext }}>
      <Question title="What's your sex?" hint={sexHint}>
        <Choices
          options={sexChoices}
          selected={answered ? profile.sex : null}
          onPick={(sex) => {
            void saveProfile({ sex });
            onNext();
          }}
        />
      </Question>
    </SetupShell>
  );
}

function HeightStep({ shell, onNext }: { shell: ShellProps; onNext: () => void }) {
  const { profile } = useMe();
  return (
    <SetupShell shell={shell} next={{ disabled: !profile.heightCm, onClick: onNext }}>
      <Question title="How tall are you?">
        <form
          className="big-entry"
          onSubmit={(e) => {
            e.preventDefault();
            if (profile.heightCm) onNext();
          }}
        >
          <HeightInput key={profile.units} cm={profile.heightCm} units={profile.units} onChange={(heightCm) => void saveProfile({ heightCm })} />
        </form>
      </Question>
    </SetupShell>
  );
}

/** BMI shows as you type: with height known it's the one thing a weight says by itself. */
function WeightStep({ shell, onNext }: { shell: ShellProps; onNext: () => void }) {
  const { profile } = useMe();
  const latest = useWeighIns().at(-1);
  const [kg, setKg] = useState(latest?.kg);
  const bmi = kg && profile.heightCm ? kg / (profile.heightCm / 100) ** 2 : undefined;
  const save = () => {
    if (!kg) return;
    if (kg !== latest?.kg || latest.date !== todayKey()) void addWeighIn({ id: crypto.randomUUID(), date: todayKey(), kg });
    onNext();
  };
  return (
    <SetupShell shell={shell} next={{ disabled: !kg, onClick: save }}>
      <Question title="What do you weigh today?" hint={["Weigh in again whenever you like from Goals.", "The trend matters more than any one day."]}>
        <form
          className="big-entry"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <WeightInput kg={kg} units={profile.units} onChange={setKg} autoFocus enterKeyHint="go" />
          {bmi && <BmiBadge bmi={bmi} withBand={!profile.birthday || ageOn(profile.birthday) >= ADULT_AGE} />}
        </form>
      </Question>
    </SetupShell>
  );
}

/** One goal area; moving on keeps what's shown, defaults included. */
function PlanStep({ area, shell, onNext }: { area: PlanArea; shell: ShellProps; onNext: () => void }) {
  const { profile, plan: history } = useMe();
  const weighIns = useWeighIns();
  const [draft, setDraft] = useState<Plan>(() => planAt(history));
  const update = (patch: Partial<Plan>) => setDraft((d) => ({ ...d, ...patch }));
  const t = dailyTargets(profile, splitPlanVersions([{ from: BEGINNING, plan: draft }]), weighIns);
  const save = () => {
    void savePlan(draft, "fix", [area]);
    onNext();
  };

  return (
    <SetupShell shell={shell} next={{ onClick: save }}>
      {area === "goal" && (
        <>
          <GoalFields draft={draft} update={update} units={profile.units} body={bodyKgAt(weighIns)} heightCm={profile.heightCm} adult={!profile.birthday || ageOn(profile.birthday) >= ADULT_AGE} />
          <h2 className="list-heading budget-heading">Your daily budget</h2>
          <Budget t={t} plan={draft} units={profile.units} />
        </>
      )}
      {area === "metabolism" && <DayFields draft={draft} update={update} />}
      {area === "macros" && <MacroFields draft={draft} update={update} t={t} />}
      {area === "fluid" && <FluidFields draft={draft} update={update} units={profile.units} onSubmit={save} />}
    </SetupShell>
  );
}

/** Just the everyday presets; working it out from a known maintenance stays on the Metabolism page. */
function DayFields({ draft, update }: { draft: Plan; update: (patch: Partial<Plan>) => void }) {
  return (
    <Question
      title="What's a normal day like?"
      lead={["Not counting workouts.", "Log those as exercise and they add to your budget."]}
      hint={["You can fine-tune it on Goals later.", "For example, from what you know you maintain on."]}
    >
      <Choices
        options={metabolismPresets.map((m) => ({ value: m.value, label: m.label, detail: `× ${m.value}` }))}
        selected={draft.metabolismMultiplier}
        onPick={(metabolismMultiplier) => update({ metabolismMultiplier, calibratedFrom: undefined })}
      />
    </Question>
  );
}
