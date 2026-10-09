import { useMemo, useState } from "react";
import { Navigate, useLocation, useParams } from "react-router";
import { FlowShell } from "../components/FlowShell";
import { ItemEditor } from "../components/ItemEditor";
import { useOpen, useSteps } from "../components/useSteps";
import { allItems, itemById, itemIcon } from "../data/catalogue";
import { deleteItem, makeOneOff, mergeInto } from "../data/followUp";
import { TrashIcon } from "../components/TrashIcon";
import { measureInBase } from "../data/measures";
import { latestNutrition } from "../data/nutrition";
import { useEntries } from "../data/store";
import type { FoodEntry, Item } from "../data/types";
import { removeUserItem, saveUserItem, userItems, useUserItems } from "../data/userItems";

export type Notify = (message: string, undo?: () => void) => void;

/** Hosts the item editor and turns its outcomes into undoable toasts. */
export function ItemEditorScreen({
  item,
  onBack,
  onClose,
  onOpen,
  notify,
}: {
  item: Item;
  onBack: () => void;
  onClose: () => void;
  onOpen?: (item: Item) => void;
  notify: Notify;
}) {
  const entries = useEntries().filter((e): e is FoodEntry => e.kind === "food" && e.itemId === item.id);
  const previous = userItems().find((i) => i.id === item.id);
  const title = item.provisional ? "Complete item" : previous ? "Edit item" : "New item";

  return (
    <FlowShell
      title={title}
      canGoBack
      onBack={onBack}
      onClose={onClose}
    >
      <ItemEditor
        key={item.id}
        // Publishing happens while the editor stays open, so it must see the stored flag, or saving would unpublish.
        item={previous?.library ? { ...item, library: true } : item}
        entries={entries}
        onOpenItem={onOpen}
        onSaved={(saved) => {
          notify(`Saved ${saved.name}`, () => (previous ? saveUserItem(previous) : removeUserItem(saved.id)));
          onBack();
        }}
        onMerge={(target) => {
          notify(`Moved to ${target.name}`, mergeInto(item, target));
          onBack();
        }}
        onPublish={
          previous && !previous.provisional && !previous.library
            ? () => {
                if (!confirm(`Publish “${item.name}” to the library? Library items can't be moved back to your items.`)) return;
                saveUserItem({ ...previous, library: true });
                notify(`${item.name} is in the library`);
              }
            : undefined
        }
        onOneOff={
          item.provisional
            ? () => {
                notify(`${item.name} logged as a one-off`, makeOneOff(item));
                onBack();
              }
            : undefined
        }
      />
    </FlowShell>
  );
}

/**
 * The part of an item URL after "/items/": an id, "new", or "<id>/duplicate". Reloading a new
 * item or a copy starts it over; only what was opened is remembered.
 */
export function resolveItemDetail(detail: string, name?: string): Item | undefined {
  if (detail === "new") return blankItem(name);
  const copy = detail.match(/^(.+)\/duplicate$/);
  if (copy) {
    const source = itemById(copy[1]);
    return source && duplicateItem(source);
  }
  return itemById(detail);
}

const blankItem = (name = ""): Item => ({ id: crypto.randomUUID(), name, type: "item", baseUnit: "g", measures: [] });

/** Its URL is the item, so back and forward move between items, e.g. through variants. */
export function ItemDetailRoute({ notify }: { notify: Notify }) {
  const params = useParams();
  const location = useLocation();
  const open = useOpen();
  const detail = params.dup ? `${params.id}/duplicate` : params.id!;
  // One resolve per history entry, so a new item keeps its id while being edited.
  const item = useMemo(() => resolveItemDetail(detail, (location.state as { name?: string } | null)?.name), [location.key]);
  // The item's own entry is the only step, so closing steps back to whatever opened it.
  const { close } = useSteps("item", undefined, "/items");
  useUserItems();

  if (!item) return <Navigate to="/items" replace />;
  return <ItemEditorScreen key={item.id} item={item} onBack={close} onClose={close} onOpen={(i) => open(`/items/${i.id}`)} notify={notify} />;
}

export function ItemsScreen({ onMenu, notify }: { onMenu: () => void; notify: Notify }) {
  const { close } = useSteps("list");
  const open = useOpen();
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string>();
  const entries = useEntries();
  const actions: ItemActions = {
    onEdit: (i) => open(`/items/${i.id}`),
    onDuplicate: (i) => open(`/items/${i.id}/duplicate`),
    onDelete: (i) => {
      setExpanded(undefined);
      notify(`Deleted ${i.name}`, deleteItem(i));
    },
  };
  useUserItems();

  const q = query.trim().toLowerCase();
  const shown = allItems().filter((i) => !q || `${i.name} ${i.variant ?? ""}`.toLowerCase().includes(q));
  const uses = (id: string) => entries.filter((e) => e.kind === "food" && e.itemId === id).length;
  const sections = [
    { title: "To complete", items: shown.filter((i) => i.provisional && uses(i.id) > 0).sort((a, b) => uses(b.id) - uses(a.id)) },
    { title: "Your items", items: shown.filter((i) => !i.provisional && !i.library) },
    { title: "Library", items: shown.filter((i) => i.library) },
  ].filter((s) => s.items.length);

  return (
    <FlowShell title="Items" canGoBack={false} onBack={close} onClose={close} onMenu={onMenu}>
      <div className="search-bar">
        <input type="search" placeholder="Search items & recipes" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <button className="row row-create" onClick={() => open("/items/new", { name: query.trim() })}>
        <span className="row-icon">＋</span>
        <span className="row-main">
          <span className="row-title">New item</span>
        </span>
      </button>
      {sections.length === 0 && <p className="empty">No items match “{query.trim()}”.</p>}
      {sections.map((s) => (
        <section key={s.title}>
          <h2 className="list-heading">
            {s.title} {s.title === "To complete" && <span className="badge badge-warn">{s.items.length}</span>}
          </h2>
          <ul className="list">
            {s.items.map((i) => (
              <ItemListRow
                key={i.id}
                item={i}
                uses={uses(i.id)}
                actions={actions}
                open={expanded === i.id}
                onToggle={() => setExpanded(expanded === i.id ? undefined : i.id)}
              />
            ))}
          </ul>
        </section>
      ))}
    </FlowShell>
  );
}

export interface ItemActions {
  onEdit: (i: Item) => void;
  onDuplicate: (i: Item) => void;
  onDelete: (i: Item) => void;
}

/** With actions, a tap expands the row like a timeline entry; without, it opens the item. */
export function ItemListRow({
  item,
  uses,
  onOpen,
  actions,
  open = false,
  onToggle,
}: {
  item: Item;
  uses: number;
  onOpen?: (i: Item) => void;
  actions?: ItemActions;
  open?: boolean;
  onToggle?: () => void;
}) {
  const per = item.baseUnit === "piece" ? "piece" : `100 ${item.baseUnit}`;
  const sub = item.provisional
    ? [`Logged ${uses}×`, item.barcode && `barcode ${item.barcode}`]
    : [
        latestNutrition(item) ? `${Math.round(latestNutrition(item)!.kcal)} kcal / ${per}` : "no nutrition",
        ...item.measures.filter((m) => m.label !== "g").map((m) => `${m.label} ${Math.round((measureInBase(item, m.label) ?? NaN) * 10) / 10 || "?"} ${item.baseUnit}`),
      ];
  const expandable = !!actions && !item.provisional;

  return (
    <li className={`item-li ${open ? "open" : ""}`}>
      <button className="row" onClick={() => (expandable ? onToggle?.() : (onOpen ?? actions?.onEdit)?.(item))} aria-expanded={expandable ? open : undefined}>
        <span className="row-icon">{item.provisional ? "✎" : itemIcon(item)}</span>
        <span className="row-main">
          <span className="row-title">
            {item.name} {item.variant && <span className="badge badge-variant">{item.variant}</span>}
            {item.provisional && <span className="badge badge-warn">Unsure</span>}
          </span>
          <span className="row-sub">{sub.filter(Boolean).join(" · ")}</span>
        </span>
        {!expandable && <span className="row-chevron">›</span>}
      </button>
      {expandable && open && (
        <div className="entry-actions item-actions">
          <button className="btn btn-small" onClick={() => actions.onEdit(item)}>
            ✏️ Edit
          </button>
          <button className="btn btn-small" onClick={() => actions.onDuplicate(item)}>
            ⧉ Duplicate
          </button>
          <button className="row-action trash-btn" onClick={() => actions.onDelete(item)} aria-label={`Delete ${item.name}`} title="Delete">
            <TrashIcon />
          </button>
        </div>
      )}
    </li>
  );
}

/**
 * A starting point for a sibling, like another batch or another bottled water: same name, icon,
 * measures and current values. The barcode and variant belong to the original, so they're left out.
 */
function duplicateItem(item: Item): Item {
  const latest = latestNutrition(item);
  return {
    ...item,
    id: crypto.randomUUID(),
    variant: undefined,
    barcode: undefined,
    library: undefined,
    nutrition: latest ? [{ ...latest, from: "" }] : undefined,
  };
}
