import { useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router";
import { type Activity, asItem, asRecipe, autoActivityIcon, autoFoodIcon, type Combo, defaultBurn, displayName, foldText, matchesQuery, type Food, type FoodItem } from "@dash/core";
import { deleteActivity, restoreActivity, saveActivity, useActivityLookup } from "../../queries/activities.queries";
import { asNewFood, deleteBatch, deleteFood, restoreBatch, rememberFoods, restoreFood, saveBatch, saveFood, useCatalogueSearch, useFoodLookup, useFoodUsage } from "../../queries/foods.queries";
import { useListedActivities } from "../activities";
import { undoBy } from "../errors";
import { ActivityEditor } from "../editors/ActivityEditor";
import { comboToRecipe, ComboEditor } from "../editors/ComboEditor";
import { ItemEditor } from "../editors/ItemEditor";
import { BatchEditor, createRecipe, RecipeEditor, startBatch } from "../editors/RecipeEditors";
import { blankItem, duplicateItem, ownCopy, unfinishedBatch, useListedFoods, usesOf } from "../foods";
import { FlowShell } from "../ui/FlowShell";
import { useDebounced } from "../ui/useDebounced";
import { FoodRow } from "../ui/FoodSearch";
import { notify } from "../ui/notify";
import { Sheet } from "../ui/Sheet";
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
  const usage = useFoodUsage();
  const listed = useListedFoods();
  const activities = useListedActivities();
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string>();
  const q = foldText(query.trim());
  const meta = tabs.find((t) => t.tab === tab)!;
  const matches = (name: string) => !q || matchesQuery(name, q);
  const foods = listed.filter((f) => f.kind === meta.kind && matches(displayName(f)));
  const lookup = useFoodLookup();
  const shared = useCatalogueSearch(useDebounced(q, 250)).data ?? [];
  // The rest of the shared catalogue, reachable by searching; opening one keeps it for this session.
  const fromCatalogue = q && meta.kind ? shared.filter((f) => f.kind === meta.kind && !f.deleted && !lookup(f.id) && matches(displayName(f))) : [];
  const openShared = (f: Food) => {
    rememberFoods(shared);
    open(`/${tab}/${f.id}`);
  };
  const uses = (id: string) => usesOf(usage, id);
  const unsure = foods.filter((f) => f.kind === "item" && f.unsure).sort((a, b) => uses(b.id) - uses(a.id));
  const rest = foods.filter((f) => !unsure.includes(f)).sort((a, b) => a.name.localeCompare(b.name));

  /** The search text is the new recipe's name, so it goes straight to adding ingredients. */
  const create = () => {
    if (tab !== "recipes") return open(`/${tab}/new`, { name: query.trim() });
    if (!query.trim()) return document.querySelector<HTMLInputElement>(".search-bar input")?.focus();
    open(`/cook/${createRecipe(query.trim()).id}`);
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
          {activities
            .filter((a) => matches(a.name))
            .sort((a, b) => a.name.localeCompare(b.name))
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
            {rest.map((f) =>
              f.kind === "item" ? (
                <FoodRow
                  key={f.id}
                  food={f}
                  onPick={() => setExpanded(expanded === f.id ? undefined : f.id)}
                  open={
                    expanded === f.id && (
                      <div className="entry-actions row-actions">
                        <button className="btn btn-small" onClick={() => open(`/items/${f.id}`)}>
                          Edit
                        </button>
                        <button className="btn btn-small" onClick={() => open("/items/new", { copyOf: f.id })}>
                          Duplicate
                        </button>
                        <FoodDeleteButton food={f} />
                      </div>
                    )
                  }
                />
              ) : (
                <FoodRow key={f.id} food={f} onPick={() => open(`/${tab}/${f.id}`)} />
              ),
            )}
          </ul>
          {fromCatalogue.length > 0 && (
            <>
              <h2 className="list-heading">From the shared catalogue</h2>
              <ul className="list">
                {fromCatalogue.map((f) => (
                  <FoodRow key={f.id} food={f} onPick={() => openShared(f)} />
                ))}
              </ul>
            </>
          )}
          {foods.length === 0 && fromCatalogue.length === 0 && <p className="empty">{q ? `Nothing matches “${query.trim()}”.` : tab === "combos" ? "A combo is things you have together, like coffee with milk." : "Nothing here yet."}</p>}
        </>
      )}
    </FlowShell>
  );
}

/** One resolve per history entry, so a new item keeps its id while being edited. */
function useResolved<T>(resolve: (id: string, state: { name?: string; copyOf?: string }) => T | undefined) {
  const { id } = useParams();
  const location = useLocation();
  return useMemo(() => resolve(id!, (location.state as { name?: string; copyOf?: string } | null) ?? {}), [location.key]);
}

function DeleteButton({ onDelete, label }: { onDelete: () => void; label: string }) {
  return (
    <button className="icon-btn trash-btn" onClick={onDelete} aria-label={`Delete ${label}`} title="Delete">
      <TrashIcon />
    </button>
  );
}

/** Retiring a public item affects everyone, so it asks first; one's own is a tap with undo. */
function FoodDeleteButton({ food, onDeleted }: { food: Food; onDeleted?: () => void }) {
  const [asking, setAsking] = useState(false);
  const remove = () => {
    removeFood(food);
    onDeleted?.();
  };
  if (!food.public) return <DeleteButton label={food.name} onDelete={remove} />;
  return (
    <>
      <DeleteButton label={food.name} onDelete={() => setAsking(true)} />
      {asking && (
        <Sheet title={`Remove ${displayName(food)} for everyone?`} onClose={() => setAsking(false)}>
          <p className="hint">It disappears from everyone's lists and search. Past entries keep showing it, and it can be restored.</p>
          <button
            className="row row-choice danger"
            onClick={() => {
              setAsking(false);
              remove();
            }}
          >
            <span className="row-main">
              <span className="row-title">Remove for everyone</span>
            </span>
          </button>
          <button className="row row-choice" onClick={() => setAsking(false)}>
            <span className="row-main">
              <span className="row-title">Keep it</span>
            </span>
          </button>
        </Sheet>
      )}
    </>
  );
}

/** Soft, so past entries keep showing it; for a public item, for everyone. */
function removeFood(food: Food) {
  void deleteFood(food.id);
  notify(`Deleted ${food.name}`, () => void restoreFood(food.id));
}

const liveOwn = (f: Food | undefined) => (f && !f.deleted ? f : undefined);

export function ItemRoute() {
  const open = useOpen();
  const { close } = useSteps("edit", undefined, "/items");
  const foods = useFoodLookup();
  const item = useResolved<FoodItem>((id, { name, copyOf }) => {
    if (id !== "new") return asItem(foods(id));
    const original = asItem(foods(copyOf));
    return original ? duplicateItem(original) : blankItem(name ?? "");
  });
  if (!item) return <Navigate to="/items" replace />;
  const stored = asItem(liveOwn(foods(item.id)));

  return (
    <FlowShell
      title={!stored ? "New item" : item.unsure ? "Complete item" : "Item"}
      canGoBack
      onBack={close}
      onClose={close}
      actions={stored && <FoodDeleteButton food={stored} onDeleted={close} />}
    >
      <ItemEditor
        key={item.id}
        item={stored ?? item}
        onSaved={(saved, done) => {
          done.then((r) => notify(`Saved ${saved.name}`, undoBy(r.undoToken)), () => {});
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

export function ComboRoute() {
  const navigate = useNavigate();
  const open = useOpen();
  const { close } = useSteps("edit", undefined, "/combos");
  const foods = useFoodLookup();
  const combo = useResolved<Combo>((id, { name }) => {
    if (id !== "new") return foods(id)?.kind === "combo" ? (foods(id) as Combo) : undefined;
    return asNewFood({ id: crypto.randomUUID(), kind: "combo", name: name ?? "", icon: autoFoodIcon(name ?? "", "combo"), iconAuto: true, catalogued: true, parts: [] }) as Combo;
  });
  if (!combo) return <Navigate to="/combos" replace />;
  const found = liveOwn(foods(combo.id));
  const stored = found?.kind === "combo" ? found : undefined;

  return (
    <FlowShell
      title={stored ? "Combo" : "New combo"}
      canGoBack
      onBack={close}
      onClose={close}
      actions={stored && !stored.public && <DeleteButton label={combo.name} onDelete={() => (removeFood(stored), close())} />}
    >
      <ComboEditor
        key={combo.id}
        combo={stored ?? combo}
        onOpen={(c) => open(`/combos/${c.id}`)}
        onSaved={(c, done) => {
          done.then((r) => notify(`Saved ${c.name}`, undoBy(r.undoToken)), () => {});
          close();
        }}
        onToRecipe={(c) => {
          const { recipe, batch } = comboToRecipe(c, foods);
          void saveFood(recipe);
          void saveBatch(recipe.id, batch);
          if (stored && !stored.public) void deleteFood(stored.id);
          notify(`${c.name} is a recipe now. Weigh it or set its portions to finish.`);
          navigate(`/recipes/${recipe.id}/${batch.id}`, { replace: true, state: { inApp: true } });
        }}
      />
    </FlowShell>
  );
}

export function RecipeRoute() {
  const open = useOpen();
  const navigate = useNavigate();
  const { id } = useParams();
  const { close } = useSteps("edit", undefined, "/recipes");
  const foods = useFoodLookup();
  const recipe = asRecipe(liveOwn(foods(id)));
  if (!recipe) return <Navigate to="/recipes" replace />;

  return (
    <FlowShell
      title="Recipe"
      canGoBack
      onBack={close}
      onClose={close}
    >
      <RecipeEditor
        recipe={recipe}
        onDelete={recipe.public ? undefined : () => (removeFood(recipe), close())}
        onOpenBatch={(b) => open(`/recipes/${recipe.id}/${b.id}`)}
        onCookAgain={() => {
          if (!unfinishedBatch(recipe)) void saveBatch(recipe.id, startBatch(recipe, foods));
          open(`/cook/${recipe.id}`);
        }}
        onToCombo={(c) => {
          void saveFood(c);
          void deleteFood(recipe.id);
          notify(`${recipe.name} is a combo now`);
          navigate(`/combos/${c.id}`, { replace: true, state: { inApp: true } });
        }}
      />
    </FlowShell>
  );
}

export function BatchRoute() {
  const { id, batchId } = useParams();
  const { close } = useSteps("edit", undefined, `/recipes/${id}`);
  const recipe = asRecipe(useFoodLookup()(id));
  const batch = recipe?.batches.find((b) => b.id === batchId && !b.deleted);
  if (!recipe || !batch) return <Navigate to="/recipes" replace />;
  const removeBatch = () => {
    void deleteBatch(recipe.id, batch.id);
    notify("Batch deleted", () => void restoreBatch(recipe.id, batch.id));
    close();
  };

  return (
    <FlowShell
      title={recipe.name}
      subtitle={batch.yield ? "Batch" : "Cooking"}
      canGoBack
      onBack={close}
      onClose={close}
      actions={!batch.shared && <DeleteButton label="batch" onDelete={removeBatch} />}
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

export function ActivityRoute() {
  const { close } = useSteps("edit", undefined, "/activities");
  const activities = useActivityLookup();
  const activity = useResolved<Activity>((id, { name }) =>
    id === "new"
      ? { id: crypto.randomUUID(), name: name ?? "", icon: autoActivityIcon(name ?? ""), iconAuto: true, measures: ["duration"], burn: defaultBurn.duration, revision: 0, deleted: false, public: false, starter: false }
      : activities(id),
  );
  if (!activity) return <Navigate to="/activities" replace />;
  const found = activities(activity.id);
  const stored = found && !found.deleted ? found : undefined;

  return (
    <FlowShell
      title={stored ? "Activity" : "New activity"}
      canGoBack
      onBack={close}
      onClose={close}
      actions={
        stored &&
        !stored.public && (
          <DeleteButton
            label={activity.name}
            onDelete={() => {
              void deleteActivity(stored.id);
              notify(`Deleted ${activity.name}`, () => void restoreActivity(stored.id));
              close();
            }}
          />
        )
      }
    >
      <ActivityEditor
        key={activity.id}
        activity={stored ?? activity}
        onSave={(input) => {
          void saveActivity(ownCopy(input, stored));
          notify(`Saved ${input.name}`);
          close();
        }}
      />
    </FlowShell>
  );
}
