import { useState } from "react";
import { autoFoodIcon, basisLabel, BEGINNING, type Combo, energyMismatch, publishBlockers, type OpenFoodFactsResult, type ComboInput, type Food, type FoodItem, type FoodItemInput, type Label, labelAt, offThePackage, type OverrideKey, estimated, type Portion, round, sameValues, type Serving } from "@dash/core";
import { completeAsCombo, mergeFood } from "../../queries/commands.queries";
import { publishFood, saveFood, saveOwnValues, useFoodUsage, useFoods } from "../../queries/foods.queries";
import { productForBarcode } from "../../queries/lookups.queries";
import { undoBy } from "../errors";
import { sharedEdit, useListedFoods, usesOf, variantsOf } from "../foods";
import { todayKey } from "../time";
import { PortionList } from "./PortionList";
import { FoodRow, FoodSearch } from "../ui/FoodSearch";
import { DateChip, tapCard } from "../ui/DateChip";
import { draftFrom, hasValues, LabelForm, labelFrom, unitOf } from "../ui/LabelForm";
import { NumberInput } from "../ui/NumberInput";
import { PublishButton } from "../ui/PublishButton";
import { IconField } from "../ui/Pickers";
import { Scanner } from "../ui/Scanner";
import { Sheet } from "../ui/Sheet";

type Undo = (() => void) | undefined;

interface Props {
  item: FoodItem;
  /** Called at once; `saved` settles when the server has it, with an undo for an edit. */
  onSaved: (item: FoodItem, saved: Promise<{ undoToken?: string }>) => void;
  /** The unsure item turned out to be this item, recipe or combo; its entries have moved over. */
  onMerged?: (target: Food, undo: Undo) => void;
  onEntryOnly?: (undo: Undo) => void;
  /** The unsure item was a combo all along; its entries now hold the combo's parts. */
  onCombo?: (combo: Combo, undo: Undo) => void;
  onOpenItem?: (item: FoodItem) => void;
}

/** Anything that changes what an amount holds; renaming the serving doesn't. */
const sameBasis = (a: Label, b: Label) =>
  a.per === b.per && a.servingSize === b.servingSize && a.servingPieces?.count === b.servingPieces?.count && !!a.servingPieces === !!b.servingPieces;

/**
 * Edits an item as its nutrition label. Changing the numbers of a label already in use asks
 * whether it was wrong (fix it everywhere) or the product changed (new values from a date).
 */
export function ItemEditor({ item, onSaved, onMerged, onEntryOnly, onCombo, onOpenItem }: Props) {
  // Usage only counts entries; a recipe batch also took this label on the day it was made.
  const inBatch = useFoods().some((f) => f.kind === "recipe" && f.batches.some((b) => b.ingredients.some((p) => p.foodId === item.id)));
  const used = usesOf(useFoodUsage(), item.id) > 0 || inBatch;
  const listed = useListedFoods();
  const latest = labelAt(item);
  const [name, setName] = useState(item.name);
  const [variant, setVariant] = useState(item.variant ?? "");
  const [brand, setBrand] = useState(item.brand ?? "");
  // Undefined while the icon follows the name.
  const [icon, setIcon] = useState(item.iconAuto ? undefined : item.icon);
  const [barcode, setBarcode] = useState(item.barcode ?? "");
  const [draft, setDraft] = useState(() => draftFrom(item.unit, latest, item.unsure ? offThePackage : estimated));
  const [servings, setServings] = useState<Serving[]>(item.servings);
  const [fluid, setFluid] = useState(!item.notFluid);
  const [scanning, setScanning] = useState(false);
  const [merging, setMerging] = useState(false);
  const [asCombo, setAsCombo] = useState(false);
  const [parts, setParts] = useState<Portion[]>([]);
  const [mergeQuery, setMergeQuery] = useState("");
  const [asking, setAsking] = useState(false);
  const [changedFrom, setChangedFrom] = useState(todayKey);
  const [busy, setBusy] = useState(false);
  const [lookedUp, setLookedUp] = useState(item.barcode ?? "");
  const [offer, setOffer] = useState<OpenFoodFactsResult>();
  const [scope, setScope] = useState<"me" | "everyone">("me");
  // Fields put back to the public value in the form; like any edit, they only count once saved.
  const [reverted, setReverted] = useState<OverrideKey[]>([]);
  const [doubtful, setDoubtful] = useState(false);
  // No public version exists yet, so the label question is about the person's own past days.
  const firstPublish = !item.public && scope === "everyone";
  const original = item.mine?.original;
  const yours = (key: OverrideKey) => original !== undefined && key in original;

  const next = labelFrom(draft);
  const blockers = publishBlockers({ labels: next ? [next] : item.labels, barcode: barcode.trim() || undefined, brand: brand.trim() || undefined });
  const unit = next ? unitOf(draft) : item.unit;
  const changed = !!latest && !!next && (!sameValues(latest.values, next.values) || !sameBasis(latest, next) || unit !== item.unit);
  const siblings = variantsOf(listed, { id: item.id, name });
  const canComplete = next?.values.kcal !== undefined;

  const build = (labels: Label[], unsure: boolean): FoodItemInput => ({
    id: item.id,
    kind: "item",
    name: name.trim(),
    ...(variant.trim() ? { variant: variant.trim() } : {}),
    ...(brand.trim() ? { brand: brand.trim() } : {}),
    icon: icon ?? autoFoodIcon(name, "item", unit),
    iconAuto: icon === undefined,
    catalogued: true,
    ...(item.originId ? { originId: item.originId } : {}),
    ...(barcode.trim() ? { barcode: barcode.trim() } : {}),
    unit,
    labels,
    servings: servings.filter((s) => s.name.trim()).map((s) => ({ ...s, name: s.name.trim() })),
    notFluid: unit === "ml" && !fluid,
    unsure,
  });

  /** Waits for the server, since only it knows every entry a command touches. */
  const command = async <T,>(run: () => Promise<T>) => {
    setBusy(true);
    try {
      return await run();
    } catch {
      return undefined;
    } finally {
      setBusy(false);
    }
  };

  const labelsFor = (change: "fix" | "changed"): Label[] => {
    if (!next) return item.labels;
    if (!latest) return [{ ...next, from: BEGINNING }];
    if (!changed) return [...item.labels.slice(0, -1), { ...next, from: latest.from }];
    if (change === "fix") return [...item.labels.slice(0, -1), { ...next, from: latest.from }];
    return [...item.labels.filter((l) => l.from < changedFrom), { ...next, from: changedFrom }];
  };

  /** A public item is changed just for the person, or for everyone; their own items as they are. */
  const sameLabels = (a: Label[], b: Label[]) => a.length === b.length && a.every((l, i) => l.from === b[i]!.from && sameValues(l.values, b[i]!.values));

  const save = (unsure: boolean, change: "fix" | "changed" = "fix", to = scope) => {
    const input = build(reverted.includes("labels") && original?.labels ? original.labels : labelsFor(change), unsure);
    if (!item.public && to === "everyone") {
      // Everyone starts from the current label; the person's own label history stays theirs as
      // their own values, so their past days keep what they were logged with.
      const current = input.labels.at(-1);
      const shared = current ? { ...input, labels: [{ ...current, from: BEGINNING }] } : input;
      const published = saveFood(shared).then(async (r) => {
        await publishFood(item.id);
        if (!sameLabels(shared.labels, input.labels)) await saveOwnValues(input);
        return r;
      });
      onSaved({ ...item, ...input }, published);
    } else if (!item.public) onSaved({ ...item, ...input }, saveFood(input));
    else if (to === "me") onSaved({ ...item, ...input }, saveOwnValues(input));
    else onSaved({ ...item, ...sharedEdit(input, item) }, saveFood(sharedEdit(input, item)));
  };

  const revert = (key: OverrideKey) => {
    if (!original) return;
    setReverted((r) => [...r, key]);
    if (key === "name") setName(original.name ?? item.name);
    if (key === "variant") setVariant(original.variant ?? "");
    if (key === "brand") setBrand(original.brand ?? "");
    if (key === "icon" || key === "iconAuto") setIcon(original.iconAuto ? undefined : (original.icon ?? item.icon));
    if (key === "labels" && original.labels) setDraft(draftFrom(item.unit, labelAt({ ...item, labels: original.labels }), offThePackage));
    if (key === "servings" && original.servings) setServings(original.servings);
  };

  const keepMine = (key: OverrideKey) => {
    setReverted((r) => r.filter((k) => k !== key));
    if (key === "name") setName(item.name);
    if (key === "variant") setVariant(item.variant ?? "");
    if (key === "brand") setBrand(item.brand ?? "");
    if (key === "icon" || key === "iconAuto") setIcon(item.iconAuto ? undefined : item.icon);
    if (key === "labels") setDraft(draftFrom(item.unit, latest, offThePackage));
    if (key === "servings") setServings(item.servings);
  };

  const yoursTag = (...keys: OverrideKey[]) => {
    const own = keys.filter(yours);
    if (!own.length) return null;
    if (own.every((k) => reverted.includes(k)))
      return (
        <span className="yours-tag">
          <span className="badge">Original on save</span>
          <button className="link-btn" onClick={() => own.forEach(keepMine)}>
            Keep mine
          </button>
        </span>
      );
    return (
      <span className="yours-tag">
        <span className="badge badge-yours">Yours</span>
        <button className="link-btn" onClick={() => own.forEach(revert)}>
          Back to original
        </button>
      </span>
    );
  };

  const makeEntryOnly = async () => {
    const saved = await command(() => saveFood({ ...build(item.labels, false), catalogued: false }));
    if (saved) onEntryOnly?.(undoBy(saved.undoToken));
  };

  const saveAsCombo = async () => {
    const combo: ComboInput = { id: crypto.randomUUID(), kind: "combo", name: name.trim(), icon: icon ?? autoFoodIcon(name, "combo"), iconAuto: icon === undefined, catalogued: true, parts };
    const result = await command(() => completeAsCombo(item.id, combo));
    const stored = result?.foods.find((f): f is Combo => f.id === combo.id && f.kind === "combo");
    if (result && stored) onCombo?.(stored, undoBy(result.undoToken));
  };

  const merge = async (target: Food) => {
    const result = await command(() => mergeFood(item.id, target.id));
    if (result) onMerged?.(target, undoBy(result.undoToken));
  };

  const fillFrom = (product: OpenFoodFactsResult) => {
    if (!name.trim()) setName(product.name);
    if (!brand.trim() && product.brand) setBrand(product.brand);
    if (product.label) setDraft(draftFrom(product.unit, product.label));
    const missing = product.servings.filter((p) => !servings.some((s) => s.name.trim().toLowerCase() === p.name.toLowerCase()));
    setServings([...servings, ...missing]);
    setOffer(undefined);
  };

  /** A new code is looked up once; an empty label is filled, a typed one is only replaced if the person says so. */
  const lookUp = async (code: string) => {
    if (code.length < 8 || code === lookedUp) return;
    setLookedUp(code);
    setOffer(undefined);
    const product = (await productForBarcode(code).catch(() => undefined))?.openFoodFacts;
    if (!product) return;
    if (!hasValues(draft)) fillFrom(product);
    else if (product.label) setOffer(product);
  };

  const trySave = (unsure: boolean, to: "me" | "everyone" = "me", sharingChecked = false) => {
    setScope(to);
    // Sharing a label whose macros don't add up asks first; a typo shouldn't reach everyone.
    if (to === "everyone" && !sharingChecked && next && energyMismatch(next.values) !== undefined) setDoubtful(true);
    else if (changed && used && !item.unsure && !reverted.includes("labels")) setAsking(true);
    else save(unsure, "fix", to);
  };

  return (
    <div className="item-editor">
      <div className={`name-row ${yours("name") || yours("icon") ? "field-yours" : ""}`}>
        <IconField value={icon} fallback={autoFoodIcon(name, "item", unit)} groups={["food", "drink"]} onChange={setIcon} />
        <input className="big-text" placeholder="Name" autoFocus={!item.name} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      {yoursTag("name", "icon", "iconAuto")}
      {item.unsure && onCombo && (
        <div className="segmented small" role="radiogroup" aria-label="Kind">
          <button role="radio" aria-selected={!asCombo} onClick={() => setAsCombo(false)}>
            Item, with a label
          </button>
          <button role="radio" aria-selected={asCombo} onClick={() => setAsCombo(true)}>
            Combo of things
          </button>
        </div>
      )}
      {item.public && <p className="hint">Shared with everyone. Change it just for you, or fix it for everyone.</p>}
      {item.unsure && onMerged && (
        <button className="link-btn" onClick={() => setMerging(true)}>
          It's something I already have…
        </button>
      )}

      {asCombo ? (
        <div className="field">
          <span className="field-label">What's in it</span>
          <p className="hint">Its entries get these parts, times how much was logged.</p>
          <PortionList portions={parts} kinds={["item", "recipe"]} addLabel="Add an item" onChange={setParts} />
        </div>
      ) : (
        <>
          <label className={`field compact ${yours("variant") ? "field-yours" : ""}`}>
            <span className="field-label">Variant {yoursTag("variant")}</span>
            <input className="text-input" placeholder="Flavour, size, raw or cooked" value={variant} onChange={(e) => setVariant(e.target.value)} />
          </label>
          <label className={`field compact ${yours("brand") ? "field-yours" : ""}`}>
            <span className="field-label">Brand {yoursTag("brand")}</span>
            <input className="text-input" placeholder="Who makes or sells it" value={brand} onChange={(e) => setBrand(e.target.value)} />
          </label>
          {siblings.length > 0 && (
            <div className="field compact">
              <span className="field-label">Other variants of “{name}”</span>
              <ul className="list">
                {siblings.map((s) => (
                  <FoodRow key={s.id} food={s} onPick={() => onOpenItem?.(s)} sub={s.variant || s.brand ? undefined : "no variant or brand"} />
                ))}
              </ul>
            </div>
          )}
          <div className="field compact">
            <span className="field-label">Barcode</span>
            <div className="barcode-row">
              <input
                className="text-input"
                inputMode="numeric"
                placeholder="None"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value.replace(/\D/g, ""))}
                onBlur={() => void lookUp(barcode)}
              />
              <button className="btn" onClick={() => setScanning(true)}>
                Scan
              </button>
            </div>
            {offer && (
              <div className="notice notice-ask">
                <span>The product database has a label for {offer.brand ? `${offer.name} (${offer.brand})` : offer.name}. Replace yours?</span>
                <div className="footer-row">
                  <button className="btn" onClick={() => setOffer(undefined)}>
                    Keep mine
                  </button>
                  <button className="btn btn-warn" onClick={() => fillFrom(offer)}>
                    Replace
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className={`field ${yours("labels") ? "field-yours" : ""}`}>
            <span className="field-label">Label {yoursTag("labels")}</span>
            <LabelForm
              draft={draft}
              onChange={(d) => {
                setDraft(d);
                setReverted((r) => r.filter((k) => k !== "labels"));
              }}
            />
            {latest && item.labels.length > 1 && (
              <details className="version-history">
                <summary>{item.labels.length} label versions</summary>
                <ul>
                  {[...item.labels].reverse().map((l) => (
                    <li key={l.from}>
                      <b>{l.from !== BEGINNING ? `From ${new Date(`${l.from}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}` : "Before"}</b>{" "}
                      {l.values.kcal ?? "?"} kcal
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>

          <div className={`field ${yours("servings") ? "field-yours" : ""}`}>
            <span className="field-label">Servings {yoursTag("servings")}</span>
            <p className="hint">What a slice, pack or mug means for this item, in {unit === "piece" ? "pieces" : unit}.</p>
            {servings.map((s, i) => (
              <div key={i} className="serving-row">
                <input className="text-input" placeholder="slice, pack…" value={s.name} onChange={(e) => setServings(servings.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <NumberInput className="text-input serving-size" placeholder="?" value={s.size} onChange={(size) => setServings(servings.map((x, j) => (j === i ? { ...x, size } : x)))} />
                <span className="unit">{unit === "piece" ? "pcs" : unit}</span>
                <button className="icon-btn small" onClick={() => setServings(servings.filter((_, j) => j !== i))} aria-label={`Remove ${s.name || "serving"}`}>
                  ✕
                </button>
              </div>
            ))}
            <button className="link-btn" onClick={() => setServings([...servings, { name: "" }])}>
              ＋ Add serving
            </button>
          </div>

          {unit === "ml" && (
            <label className="check-line">
              <input type="checkbox" checked={fluid} onChange={(e) => setFluid(e.target.checked)} />
              💧 Counts toward fluid (turn off for oil, syrup, sauces)
            </label>
          )}
        </>
      )}

      {item.unsure && used && !asCombo && (
        <div className="field">
          <span className="field-label">Or</span>
          {onEntryOnly && (
            <button className="row row-unsure" disabled={busy} onClick={makeEntryOnly}>
              <span className="row-icon">✎</span>
              <span className="row-main">
                <span className="row-title">It was a one-off</span>
                <span className="row-sub">Keep its entries as they are, without an item</span>
              </span>
            </button>
          )}
        </div>
      )}

      <div className="flow-footer">
        {asCombo ? (
          <button
            className="btn btn-primary btn-block"
            disabled={!name.trim() || parts.length === 0 || busy}
            onClick={saveAsCombo}
          >
            Save as combo
          </button>
        ) : item.unsure ? (
          <div className="save-choices">
            <button className="btn btn-primary btn-block" disabled={!name.trim() || !canComplete} onClick={() => trySave(false)}>
              Save as complete
            </button>
            <button className="btn btn-block" disabled={!name.trim()} onClick={() => trySave(true)}>
              Keep unsure
            </button>
          </div>
        ) : !item.public && item.catalogued ? (
          <div className="save-choices">
            <PublishButton blockers={blockers} label="Save and publish" disabled={!name.trim()} onClick={() => trySave(false, "everyone")} />
            <button className={`btn btn-block ${blockers.length ? "btn-primary" : ""}`} disabled={!name.trim()} onClick={() => trySave(false, "me")}>
              Save privately
            </button>
          </div>
        ) : item.public ? (
          <div className="save-choices">
            <button className="btn btn-primary btn-block" disabled={!name.trim()} onClick={() => trySave(false, "me")}>
              Save just for me
            </button>
            <button className="btn btn-block" disabled={!name.trim()} onClick={() => trySave(false, "everyone")}>
              Fix it for everyone
            </button>
          </div>
        ) : (
          <button className="btn btn-primary btn-block" disabled={!name.trim()} onClick={() => trySave(false)}>
            Save
          </button>
        )}
      </div>

      {scanning && (
        <div className="scanner-layer">
          <Scanner
            onCode={(code) => {
              setBarcode(code);
              setScanning(false);
              void lookUp(code);
            }}
            onClose={() => setScanning(false)}
          />
        </div>
      )}

      {merging && (
        <Sheet title={`What was “${item.name}”?`} onClose={() => setMerging(false)}>
          <FoodSearch
            query={mergeQuery}
            onQuery={setMergeQuery}
            kinds={["item", "recipe", "combo"]}
            recentIds={[]}
            placeholder="Search items, recipes, combos"
            onPick={(target) => {
              if (target.id === item.id || busy) return;
              setMerging(false);
              void merge(target);
            }}
          />
        </Sheet>
      )}

      {doubtful && next && (
        <Sheet title="The macros don't add up" onClose={() => setDoubtful(false)}>
          <p className="hint">
            They make about {energyMismatch(next.values)} kcal, but the label says {next.values.kcal}. Everyone would get this label.
          </p>
          <button
            className="row row-choice"
            onClick={() => {
              setDoubtful(false);
              trySave(false, "everyone", true);
            }}
          >
            <span className="row-main">
              <span className="row-title">Share it anyway</span>
              <span className="row-sub">It's right, e.g. alcohol or lots of fibre</span>
            </span>
          </button>
          <button
            className="row row-choice"
            onClick={() => {
              setDoubtful(false);
              trySave(false, "me");
            }}
          >
            <span className="row-main">
              <span className="row-title">Save just for me</span>
            </span>
          </button>
          <button className="row row-choice" onClick={() => setDoubtful(false)}>
            <span className="row-main">
              <span className="row-title">Keep editing</span>
            </span>
          </button>
        </Sheet>
      )}

      {asking && latest && next && (
        <Sheet title={firstPublish ? "Publish with the new label" : "The label changed"} onClose={() => setAsking(false)}>
          <p className="hint">
            It said {latest.values.kcal ?? "?"} kcal {basisLabel(latest, item.unit)}, now {next.values.kcal ?? "?"} kcal {basisLabel(next, unit)}. Entries already logged
            use the old label.
          </p>
          {next.values.kcal !== undefined && latest.values.kcal !== undefined && next.values.kcal !== latest.values.kcal && sameBasis(latest, next) && (
            <p className="hint">That's {round(((next.values.kcal - latest.values.kcal) / (latest.values.kcal || 1)) * 100, 0)}% different.</p>
          )}
          <button className="row row-choice" onClick={() => save(false, "fix")}>
            <span className="row-main">
              <span className="row-title">{firstPublish ? "Publish and update my entries" : "It was wrong"}</span>
              <span className="row-sub">{firstPublish ? "Past days use the new values too" : "Fix it everywhere, including past days"}</span>
            </span>
          </button>
          <div className="row row-choice" {...tapCard(() => save(false, "changed"))}>
            <span className="row-main">
              <span className="row-title">{firstPublish ? "Publish from a date" : "The product changed"}</span>
              <span className="row-sub">{firstPublish ? "Entries before it keep the old values" : "Past days keep the old values"}</span>
              <DateChip prefix={firstPublish ? "Published values from" : "New values from"} value={changedFrom} min={latest.from === BEGINNING ? undefined : latest.from} max={todayKey()} onChange={setChangedFrom} />
            </span>
          </div>
        </Sheet>
      )}
    </div>
  );
}
