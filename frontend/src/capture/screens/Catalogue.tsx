import { useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router";
import { activityById, allActivities, deleteActivity, saveActivity, useActivities } from "../../core/activities";
import { defaultBurn } from "../../core/burn";
import { entriesUsing, useEntries } from "../../core/entries";
import { deleteFood } from "../../core/followUp";
import { allFoods, comboById, itemById, recipeById, saveFood, useFoods } from "../../core/foods";
import type { Activity, Combo, Food, Item, Recipe } from "../../core/types";
import { suggestIcon } from "../../core/icons";
import { ActivityEditor } from "../editors/ActivityEditor";
import { comboToRecipe, ComboEditor } from "../editors/ComboEditor";
import { ItemEditor } from "../editors/ItemEditor";
import { BatchEditor, RecipeEditor, startBatch } from "../editors/RecipeEditors";
import { FlowShell } from "../ui/FlowShell";
import { FoodRow } from "../ui/FoodSearch";
import type { Notify } from "../ui/notify";
import { TrashIcon } from "../ui/TrashIcon";
import { useOpen, useSteps } from "../ui/useSteps";

export type CatalogueTab = "items" | "combos" | "recipes" | "activities";

const tabs: { tab: CatalogueTab; label: string; kind?: Food["kind"]; newLabel: string }[] = [
  { tab: "items", label: "Items", kind: "item", newLabel: "New item" },
  { tab: "combos", label: "Combos", kind: "combo", newLabel: "New combo" },
  { tab: "recipes", label: "Recipes", kind: "recipe", newLabel: "New recipe" },
  { tab: "activities", label: "Activities", newLabel: "New activity" },
];

export function CatalogueScreen({ tab, onMenu }: { tab: CatalogueTab; onMenu: () => void }) {
  const { close } = useSteps("list");
  const open = useOpen();
  const navigate = useNavigate();
  const entries = useEntries();
  useFoods();
  useActivities();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const meta = tabs.find((t) => t.tab === tab)!;
  const matches = (name: string) => !q || name.toLowerCase().includes(q);
  const foods = allFoods().filter((f) => f.kind === meta.kind && matches(`${f.name} ${f.kind === "item" ? (f.variant ?? "") : ""}`));
  const uses = (id: string) => entriesUsing(entries, id).length;
  const unsure = foods.filter((f) => f.kind === "item" && f.unsure).sort((a, b) => uses(b.id) - uses(a.id));
  const rest = foods.filter((f) => !unsure.includes(f)).sort((a, b) => a.name.localeCompare(b.name));

  /** The search text is the new recipe's name, so it goes straight to adding ingredients. */
  const create = () => {
    if (tab !== "recipes") return open(`/${tab}/new`, { name: query.trim() });
    if (!query.trim()) return document.querySelector<HTMLInputElement>(".search-bar input")?.focus();
    const name = query.trim();
    const recipe: Recipe = { id: crypto.randomUUID(), kind: "recipe", name, icon: suggestIcon(name, ["food"]), batches: [] };
    saveFood({ ...recipe, batches: [startBatch(recipe)] });
    open(`/cook/${recipe.id}`);
  };

  return (
    <FlowShell title="Catalogue" canGoBack={false} onBack={close} onClose={close} onMenu={onMenu}>
      <div className="segmented tabs">
        {tabs.map((t) => (
          <button key={t.tab} aria-selected={t.tab === tab} onClick={() => navigate(`/${t.tab}`, { replace: true, state: history.state?.usr })}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="search-bar">
        <input type="search" placeholder={`Search ${meta.label.toLowerCase()}`} value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <button className="row row-create" onClick={create}>
        <span className="row-icon">＋</span>
        <span className="row-main">
          <span className="row-title">{q ? `${meta.newLabel} “${query.trim()}”` : meta.newLabel}</span>
          {tab === "recipes" && !q && <span className="row-sub">Type its name above</span>}
        </span>
      </button>

      {tab === "activities" ? (
        <ul className="list">
          {allActivities()
            .filter((a) => matches(a.name))
            .map((a) => (
              <li key={a.id}>
                <button className="row" onClick={() => open(`/activities/${a.id}`)}>
                  <span className="row-icon">{a.icon}</span>
                  <span className="row-main">
                    <span className="row-title">{a.name}</span>
                    <span className="row-sub">{a.burn ? `Calories from ${a.burn.basis}` : "Calories entered by hand"}</span>
                  </span>
                  <span className="row-chevron">›</span>
                </button>
              </li>
            ))}
        </ul>
      ) : (
        <>
          {unsure.length > 0 && (
            <>
              <h2 className="list-heading">
                To complete <span className="badge badge-warn">{unsure.length}</span>
              </h2>
              <ul className="list">
                {unsure.map((f) => (
                  <FoodRow key={f.id} food={f} onPick={() => open(`/items/${f.id}`)} sub={`Logged ${uses(f.id)}×`} />
                ))}
              </ul>
            </>
          )}
          {rest.length > 0 && unsure.length > 0 && <h2 className="list-heading">{meta.label}</h2>}
          <ul className="list">
            {rest.map((f) => (
              <FoodRow key={f.id} food={f} onPick={() => open(`/${tab}/${f.id}`)} />
            ))}
          </ul>
          {foods.length === 0 && <p className="empty">{q ? `Nothing matches “${query.trim()}”.` : tab === "combos" ? "A combo is things you have together, like coffee with milk." : "Nothing here yet."}</p>}
        </>
      )}
    </FlowShell>
  );
}

/** One resolve per history entry, so a new item keeps its id while being edited. */
function useResolved<T>(resolve: (id: string, name?: string) => T | undefined) {
  const { id } = useParams();
  const location = useLocation();
  return useMemo(() => resolve(id!, (location.state as { name?: string } | null)?.name), [location.key]);
}

function DeleteButton({ onDelete, label }: { onDelete: () => void; label: string }) {
  return (
    <button className="icon-btn trash-btn" onClick={onDelete} aria-label={`Delete ${label}`} title="Delete">
      <TrashIcon />
    </button>
  );
}

export function ItemRoute({ notify }: { notify: Notify }) {
  const open = useOpen();
  const { close } = useSteps("edit", undefined, "/items");
  const item = useResolved<Item>((id, name) => (id === "new" ? { id: crypto.randomUUID(), kind: "item", name: name ?? "", unit: "g", labels: [], servings: [] } : itemById(id)));
  useFoods();
  if (!item) return <Navigate to="/items" replace />;
  const stored = itemById(item.id);

  return (
    <FlowShell
      title={!stored ? "New item" : item.unsure ? "Complete item" : "Item"}
      canGoBack
      onBack={close}
      onClose={close}
      actions={stored && <DeleteButton label={item.name} onDelete={() => (notify(`Deleted ${item.name}`, deleteFood(stored)), close())} />}
    >
      <ItemEditor
        key={item.id}
        item={stored ?? item}
        onSaved={(saved) => {
          notify(`Saved ${saved.name}`);
          close();
        }}
        onMerged={(target, undo) => {
          notify(`Moved to ${target.name}`, undo);
          close();
        }}
        onEntryOnly={(undo) => {
          notify(`${item.name} kept as a one-off`, undo);
          close();
        }}
        onCombo={(combo, undo) => {
          notify(`${combo.name} is a combo now`, undo);
          close();
        }}
        onOpenItem={(i) => open(`/items/${i.id}`)}
      />
    </FlowShell>
  );
}

export function ComboRoute({ notify }: { notify: Notify }) {
  const navigate = useNavigate();
  const { close } = useSteps("edit", undefined, "/combos");
  const combo = useResolved<Combo>((id, name) => (id === "new" ? { id: crypto.randomUUID(), kind: "combo", name: name ?? "", parts: [] } : comboById(id)));
  useFoods();
  if (!combo) return <Navigate to="/combos" replace />;
  const stored = comboById(combo.id);

  return (
    <FlowShell
      title={stored ? "Combo" : "New combo"}
      canGoBack
      onBack={close}
      onClose={close}
      actions={stored && <DeleteButton label={combo.name} onDelete={() => (notify(`Deleted ${combo.name}`, deleteFood(stored)), close())} />}
    >
      <ComboEditor
        key={combo.id}
        combo={stored ?? combo}
        onSaved={(c) => {
          notify(`Saved ${c.name}`);
          close();
        }}
        onToRecipe={(c) => {
          const recipe = comboToRecipe(c);
          saveFood(recipe);
          if (stored) deleteFood(stored);
          notify(`${c.name} is a recipe now. Weigh it or set its portions to finish.`);
          navigate(`/recipes/${recipe.id}/${recipe.batches[0].id}`, { replace: true, state: { inApp: true } });
        }}
      />
    </FlowShell>
  );
}

export function RecipeRoute({ notify }: { notify: Notify }) {
  const open = useOpen();
  const navigate = useNavigate();
  const { id } = useParams();
  const { close } = useSteps("edit", undefined, "/recipes");
  useFoods();
  const recipe = recipeById(id);
  if (!recipe) return <Navigate to="/recipes" replace />;

  return (
    <FlowShell
      title="Recipe"
      canGoBack
      onBack={close}
      onClose={close}
      actions={<DeleteButton label={recipe.name} onDelete={() => (notify(`Deleted ${recipe.name}`, deleteFood(recipe)), close())} />}
    >
      <RecipeEditor
        recipe={recipe}
        onOpenBatch={(b) => open(`/recipes/${recipe.id}/${b.id}`)}
        onCookAgain={() => {
          if (!recipe.batches.some((b) => !b.yield)) saveFood({ ...recipe, batches: [...recipe.batches, startBatch(recipe)] });
          open(`/cook/${recipe.id}`);
        }}
        onToCombo={(c) => {
          saveFood(c);
          deleteFood(recipe);
          notify(`${recipe.name} is a combo now`);
          navigate(`/combos/${c.id}`, { replace: true, state: { inApp: true } });
        }}
      />
    </FlowShell>
  );
}

export function BatchRoute({ notify }: { notify: Notify }) {
  const { id, batchId } = useParams();
  const { close } = useSteps("edit", undefined, `/recipes/${id}`);
  const entries = useEntries();
  useFoods();
  const recipe = recipeById(id);
  const batch = recipe?.batches.find((b) => b.id === batchId);
  if (!recipe || !batch) return <Navigate to="/recipes" replace />;
  const removeBatch = () => {
    const before = recipe;
    saveFood({ ...recipe, batches: recipe.batches.filter((b) => b.id !== batch.id) });
    notify("Batch deleted", () => saveFood(before));
    close();
  };

  return (
    <FlowShell
      title={recipe.name}
      subtitle={batch.yield ? "Batch" : "Cooking"}
      canGoBack
      onBack={close}
      onClose={close}
      actions={!entriesUsing(entries, recipe.id).some((e) => e.lines.some((l) => l.batchId === batch.id)) && <DeleteButton label="batch" onDelete={removeBatch} />}
    >
      <BatchEditor
        recipeId={recipe.id}
        batchId={batch.id}
        onFinished={() => {
          notify(`Saved ${recipe.name}`);
          close();
        }}
      />
    </FlowShell>
  );
}

export function ActivityRoute({ notify }: { notify: Notify }) {
  const { close } = useSteps("edit", undefined, "/activities");
  const entries = useEntries();
  useActivities();
  const activity = useResolved<Activity>((id, name) =>
    id === "new" ? { id: crypto.randomUUID(), name: name ?? "", icon: "", measures: ["duration"], burn: defaultBurn.duration } : activityById(id),
  );
  if (!activity) return <Navigate to="/activities" replace />;
  const stored = activityById(activity.id);
  const used = entries.some((e) => e.kind === "exercise" && e.activityId === activity.id);

  return (
    <FlowShell
      title={stored ? "Activity" : "New activity"}
      canGoBack
      onBack={close}
      onClose={close}
      actions={stored && <DeleteButton label={activity.name} onDelete={() => (notify(`Deleted ${activity.name}`, deleteActivity(stored, used)), close())} />}
    >
      <ActivityEditor
        key={activity.id}
        activity={stored ?? activity}
        onSave={(saved) => {
          saveActivity(saved);
          notify(`Saved ${saved.name}`);
          close();
        }}
      />
    </FlowShell>
  );
}
