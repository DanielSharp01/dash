import { useState } from "react";
import { asItem, autoFoodIcon, basisLabel, displayName, sameItem, BEGINNING, type Combo, energyImpossible, energyMismatch, sharingBlockers, type OpenFoodFactsResult, type ComboInput, type Food, type FoodItem, type FoodItemInput, type Label, labelAt, offThePackage, estimated, type Portion, round, sameValues, type Serving } from "@dash/core";
import { completeAsCombo, mergeFood } from "../../queries/commands.queries";
import { copyFood, publishFood, saveFood, useFoodUsage, useFoods } from "../../queries/foods.queries";
import { useMe } from "../../queries/me.queries";
import { productForBarcode } from "../../queries/lookups.queries";
import { undoBy } from "../errors";
import { useListedFoods, usesOf, variantsOf } from "../foods";
import { todayKey } from "../time";
import { PortionList } from "./PortionList";
import { FoodSearch } from "../ui/FoodSearch";
import { DateButton, tapCard } from "../ui/DateButton";
import { draftFrom, hasValues, LabelForm, labelFrom, unitOf } from "../ui/LabelForm";
import { NumberInput } from "../ui/NumberInput";
import { SaveButton } from "../ui/SaveButton";
import { SharingControl } from "../ui/SharingControl";
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
  const allFoods = useFoods();
  const inBatch = allFoods.some((f) => f.kind === "recipe" && f.batches.some((b) => b.ingredients.some((p) => p.foodId === item.id)));
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
  // Who a save is for: the person's own item, everyone (fixing a public item, or making one's own
  // public), or a copy of a public item that becomes theirs.
  const [scope, setScope] = useState<"mine" | "everyone" | "copy">("mine");
  const [doubtful, setDoubtful] = useState(false);
  // Undefined until the person picks, so the default follows the label as it's filled in.
  const [sharing, setSharing] = useState<boolean>();
  const { profile } = useMe();
  const isNew = !allFoods.some((f) => f.id === item.id);
  const sharedOrigin = !item.public && item.originId ? asItem(allFoods.find((f) => f.id === item.originId)) : undefined;
  const myVersion = item.public ? asItem(allFoods.find((f) => !f.public && !f.deleted && f.originId === item.id)) : undefined;

  const next = labelFrom(draft);
  const canComplete = next?.values.kcal !== undefined;
  // No kcal means not finished: an unsure item stays one, and an item that never had a label becomes one.
  const staysUnsure = item.unsure ? !canComplete : !latest && !next;
  // Emptying the label of a finished item would keep the old label, or none, silently.
  const noLabel = !item.unsure && latest && !next ? ["The label is empty"] : [];
  // Macros that need more energy than stated can't be right, so they never reach everyone.
  const impossible = next && energyImpossible(next.values) ? ["The macros need more kcal than the label says"] : [];
  const unit = next ? unitOf(draft) : item.unit;
  const changed = !!latest && !!next && (!sameValues(latest.values, next.values) || !sameBasis(latest, next) || unit !== item.unit);
  const siblings = variantsOf(listed, { id: item.id, name });
  const twin = siblings.find((s) => sameItem(s, { name, variant, brand }));
  const sharingBlocked = [
    ...sharingBlockers({ labels: next ? [next] : item.labels, barcode: barcode.trim() || undefined, brand: brand.trim() || undefined }),
    ...(twin?.public ? ["The same item is already shared."] : []),
  ];
  const goesPublic = (sharing ?? (isNew && !!next?.verified && profile.shareVerified)) && sharingBlocked.length === 0 && !staysUnsure;

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
  const save = (unsure: boolean, change: "fix" | "changed" = "fix", to = scope) => {
    const input = build(labelsFor(change), unsure);
    if (item.public && to === "copy") {
      // The copy starts as the shared item, with the edits made here on top.
      onSaved({ ...item, ...input }, copyFood(item.id).then(({ food }) => saveFood({ ...input, id: food.id, originId: item.id })));
    } else if (!item.public && to === "everyone") {
      // Shared with every label version it has, so past days keep their values for everyone.
      onSaved({ ...item, ...input }, saveFood(input).then(async (r) => (await publishFood(item.id), r)));
    } else onSaved({ ...item, ...input }, saveFood(input));
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

  const trySave = (to: "mine" | "everyone" | "copy" = goesPublic ? "everyone" : "mine", sharingChecked = false) => {
    setScope(to);
    // Sharing a label whose macros don't add up asks first; a typo shouldn't reach everyone.
    if (to === "everyone" && !sharingChecked && next && energyMismatch(next.values) !== undefined) setDoubtful(true);
    else if (used && !item.unsure && changed) setAsking(true);
    else save(staysUnsure, "fix", to);
  };

  return (
    <div className="item-editor">
      <div className="name-row">
        <IconField value={icon} fallback={autoFoodIcon(name, "item", unit)} groups={["food", "drink"]} onChange={setIcon} />
        <input className="big-text" placeholder="Name" autoFocus={!item.name} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
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
      {sharedOrigin && <p className="hint own-version">Your own version of {displayName(sharedOrigin)}. Fixes to the shared one don't reach it.</p>}
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
          <label className="field compact">
            <span className="field-label">Variant</span>
            <input className="text-input" placeholder="Flavour, size, raw or cooked" value={variant} onChange={(e) => setVariant(e.target.value)} />
          </label>
          <label className="field compact">
            <span className="field-label">Brand</span>
            <input className="text-input" placeholder="Who makes or sells it" value={brand} onChange={(e) => setBrand(e.target.value)} />
          </label>
          {twin && (
            <p className="hint warn-hint">
              There's already {displayName(twin)}
              {twin.public ? " in the shared catalogue" : ""}. Give this one a different variant or brand.{" "}
              {onOpenItem && (
                <button className="link-btn" onClick={() => onOpenItem(twin)}>
                  Open it
                </button>
              )}
            </p>
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

          <div className="field">
            <span className="field-label">Label</span>
            <LabelForm draft={draft} onChange={setDraft} />
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

          <div className="field">
            <span className="field-label">Servings</span>
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
            <button className="row row-create" onClick={() => setServings([...servings, { name: "" }])}>
              <span className="row-icon">＋</span>
              <span className="row-main">
                <span className="row-title">Add serving</span>
              </span>
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

      {!asCombo && item.catalogued && (
        <SharingControl isPublic={goesPublic} shared={item.public} blockers={staysUnsure ? ["Public needs kcal, protein, carbs and fat."] : sharingBlocked} onChange={setSharing}>
          {item.public &&
            (myVersion ? (
              onOpenItem ? (
                <button className="link-btn" onClick={() => onOpenItem(myVersion)}>
                  Open my version
                </button>
              ) : (
                <p className="hint own-version">You already have your own version of this, {displayName(myVersion)}.</p>
              )
            ) : (
              <>
                <button className="link-btn" disabled={!name.trim()} onClick={() => trySave("copy")}>
                  Make my own version
                </button>
                <p className="hint">A private copy: your entries move to it, and fixes to the shared one won't reach it.</p>
              </>
            ))}
        </SharingControl>
      )}

      <div className="flow-footer at-end">
        {asCombo ? (
          <button
            className="btn btn-primary btn-block"
            disabled={!name.trim() || parts.length === 0 || busy}
            onClick={saveAsCombo}
          >
            Save as combo
          </button>
        ) : (
          <SaveButton
            label={item.public ? "Save for everyone" : "Save"}
            note={staysUnsure ? "No kcal yet, so it's saved as unsure and waits in To follow up on Today." : undefined}
            refusals={[...noLabel, ...(item.public || goesPublic ? impossible : [])]}
            disabled={!name.trim()}
            onClick={() => trySave(item.public ? "everyone" : undefined)}
          />
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
              trySave("everyone", true);
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
              trySave(item.public ? "copy" : "mine");
            }}
          >
            <span className="row-main">
              <span className="row-title">{item.public ? "Make my own version" : "Keep it private"}</span>
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
        <Sheet title="The label changed" onClose={() => setAsking(false)}>
          <p className="hint">
            It said {latest.values.kcal ?? "?"} kcal {basisLabel(latest, item.unit)}, now {next.values.kcal ?? "?"} kcal {basisLabel(next, unit)}. Entries already logged use
            the old label.
          </p>
          {next.values.kcal !== undefined && latest.values.kcal !== undefined && next.values.kcal !== latest.values.kcal && sameBasis(latest, next) && (
            <p className="hint">That's {round(((next.values.kcal - latest.values.kcal) / (latest.values.kcal || 1)) * 100, 0)}% different.</p>
          )}
          <button className="row row-choice" onClick={() => save(staysUnsure, "fix")}>
            <span className="row-main">
              <span className="row-title">It was wrong</span>
              <span className="row-sub">Fix it everywhere, including past days</span>
            </span>
          </button>
          <div className="row row-choice" {...tapCard(() => save(staysUnsure, "changed"))}>
            <span className="row-main">
              <span className="row-title">The product changed</span>
              <span className="row-sub">Past days keep the old values</span>
              <DateButton prefix="New values from" value={changedFrom} min={latest.from === BEGINNING ? undefined : latest.from} max={todayKey()} onChange={setChangedFrom} />
            </span>
          </div>
        </Sheet>
      )}
    </div>
  );
}
