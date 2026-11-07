import { useCallback, useState } from "react";
import { asRecipe, cookingState, type Recipe, type StoredBatch } from "@dash/core";
import { useFoodLookup } from "../../queries/foods.queries";
import { BatchEditor, copySource, createRecipe, startBatch } from "../editors/RecipeEditors";
import { batchLabel, unfinishedBatch } from "../foods";
import { todayKey } from "../time";
import { FlowShell } from "../ui/FlowShell";
import { FoodSearch } from "../ui/FoodSearch";
import { notify } from "../ui/notify";
import { Choices, Question } from "../ui/Question";
import { useSteps } from "../ui/useSteps";

type Step = "name" | "choose" | "batch" | "done";

const yieldLabel = (b: StoredBatch) => (!b.yield ? "" : "grams" in b.yield ? `${b.yield.grams.toLocaleString()} g` : `${b.yield.portions} portions`);

const copiedLabel = (r: Recipe) => {
  const source = copySource(r);
  return source?.ingredients.length ? batchLabel(source) : undefined;
};

/**
 * Records a recipe as it's made, without logging anything eaten. A batch still cooking opens
 * straight away; one finished today is offered to fix before cooking again. A new batch is saved
 * from its first change on, so closing mid-cook keeps it and closing untouched leaves nothing.
 */
export function CookFlow({ recipeId, onDone }: { recipeId?: string; onDone: (logPortionOf?: Recipe) => void }) {
  const foods = useFoodLookup();
  const exit = useCallback(() => onDone(), [onDone]);
  const opened = asRecipe(foods(recipeId));
  const [start] = useState(() => opened && cookingState(opened, todayKey()));
  const { step, depth, go, back, close } = useSteps<Step>(recipeId ? (start?.kind === "finished-today" ? "choose" : "batch") : "name", exit);
  const [query, setQuery] = useState("");
  const [current, setCurrent] = useState(recipeId);
  const recipe = asRecipe(foods(current));
  const [draft, setDraft] = useState(() => (opened && start?.kind === "fresh" ? startBatch(opened, foods) : undefined));
  // A copy looks just like a real cooking, so it says where it came from for as long as it's open.
  const [copiedFrom, setCopiedFrom] = useState(() => (opened && start?.kind === "fresh" ? copiedLabel(opened) : undefined));
  // Set while fixing a batch finished today instead of cooking a new one.
  const [fixingId, setFixingId] = useState<string>();
  const fixing = fixingId ? recipe?.batches.find((b) => b.id === fixingId && !b.deleted) : undefined;
  const batch = recipe && (fixing ?? unfinishedBatch(recipe) ?? draft);

  const cookAgain = (r: Recipe) => {
    setFixingId(undefined);
    setDraft(startBatch(r, foods));
    setCopiedFrom(copiedLabel(r));
    go("batch");
  };
  const cook = (r: Recipe) => {
    const state = cookingState(r, todayKey());
    setCurrent(r.id);
    if (state.kind === "finished-today") return go("choose");
    if (state.kind === "fresh") return cookAgain(r);
    go("batch");
  };

  if (step === "choose" && recipe) {
    const state = cookingState(recipe, todayKey());
    const today = state.kind === "finished-today" ? state.batch : undefined;
    return (
      <FlowShell title={recipe.name} canGoBack={depth > 1} onBack={back} onClose={close}>
        <Question title="You cooked this today" hint={["Fix today's batch, or start a new one from its ingredients."]}>
          <Choices
            options={[...(today ? [{ value: "fix" as const, label: "Edit today's batch", detail: yieldLabel(today) }] : []), { value: "again" as const, label: "Cook again" }]}
            onPick={(choice) => {
              if (choice === "again" || !today) return cookAgain(recipe);
              setFixingId(today.id);
              go("batch");
            }}
          />
        </Question>
      </FlowShell>
    );
  }

  if (step === "done" && recipe)
    return (
      <FlowShell title={recipe.name} subtitle="Done cooking" canGoBack={false} onBack={back} onClose={close}>
        <p className="hint">It's in your recipes now. Log portions from I ate whenever you eat some.</p>
        <div className="save-choices">
          <button
            className="btn btn-primary btn-block"
            onClick={() => {
              onDone(recipe);
            }}
          >
            Log a portion now
          </button>
          <button className="btn btn-block" onClick={close}>
            Done
          </button>
        </div>
      </FlowShell>
    );

  if (step === "batch" && recipe && batch)
    return (
      <FlowShell title={recipe.name} subtitle={`${fixing ? "Batch" : "Cooking"} · ${batchLabel(batch)}`} canGoBack={depth > 1} onBack={back} onClose={close}>
        {copiedFrom && batch.id === draft?.id && (
          <div className="notice">
            <span>Copied from {copiedFrom}, change what's different.</span>
          </div>
        )}
        <BatchEditor
          recipeId={recipe.id}
          batchId={batch.id}
          draft={draft}
          onFinished={() => {
            if (!fixing) return go("done");
            notify(`Saved ${recipe.name}`);
            close();
          }}
        />
      </FlowShell>
    );

  return (
    <FlowShell title="I cooked" canGoBack={false} onBack={back} onClose={close}>
      <p className="hint">Name the dish, then add ingredients as they go in. You log what you eat from it later, in portions.</p>
      <FoodSearch
        query={query}
        onQuery={setQuery}
        kinds={["recipe"]}
        recentIds={[]}
        unfinished
        placeholder="What are you cooking?"
        onPick={(f) => f.kind === "recipe" && cook(f)}
        onNew={(name) => {
          setCurrent(createRecipe(name.trim()).id);
          setDraft(startBatch({ batches: [] }));
          setCopiedFrom(undefined);
          go("batch");
        }}
        extra={
          !query.trim() && (
            <li>
              <button className="row row-create" onClick={() => document.querySelector<HTMLInputElement>(".search-bar input")?.focus()}>
                <span className="row-icon">＋</span>
                <span className="row-main">
                  <span className="row-title">New dish</span>
                  <span className="row-sub">Type its name above, e.g. chicken stew</span>
                </span>
              </button>
            </li>
          )
        }
      />
    </FlowShell>
  );
}
