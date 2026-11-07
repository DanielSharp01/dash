import { useState } from "react";
import type { Pot } from "@dash/core";
import { useMe } from "../../queries/me.queries";
import { addPot, removePot } from "../../queries/pots.queries";
import { FlowShell } from "../ui/FlowShell";
import { NumberInput } from "../ui/NumberInput";
import { TrashIcon } from "../ui/TrashIcon";
import { useSteps } from "../ui/useSteps";

/** What food and drink get weighed in; glasses and other containers with a capacity join the pots here. */
export function ContainersScreen({ onMenu }: { onMenu: () => void }) {
  const { close } = useSteps<"list">("list");
  const { pots } = useMe();
  return (
    <FlowShell title="Containers" canGoBack={false} onBack={close} onClose={close} onMenu={onMenu}>
      <section className="settings-group">
        <Pots pots={pots} />
      </section>
    </FlowShell>
  );
}

/** Weighed once while empty, so a finished dish can be weighed without tipping it out. */
function Pots({ pots }: { pots: Pot[] }) {
  const [name, setName] = useState("");
  const [grams, setGrams] = useState<number>();
  return (
    <div className="field">
      <span className="field-label">Pots and pans</span>
      <p className="hint">Their empty weight comes off when you weigh a finished dish in them.</p>
      <ul className="list">
        {pots.map((p) => (
          <li key={p.id} className="weigh-row">
            <span className="weigh-date">{p.name}</span>
            <b>{p.grams.toLocaleString()} g</b>
            <button className="icon-btn small trash-btn" aria-label={`Remove ${p.name}`} onClick={() => void removePot(p)}>
              <TrashIcon />
            </button>
          </li>
        ))}
      </ul>
      <div className="serving-row">
        <input className="text-input" placeholder="e.g. Big pot" value={name} onChange={(e) => setName(e.target.value)} />
        <NumberInput integer className="text-input serving-size" placeholder="g" value={grams} onChange={setGrams} />
        <button
          className="btn btn-small"
          disabled={!name.trim() || !grams}
          onClick={() => {
            void addPot({ id: crypto.randomUUID(), name: name.trim(), grams: grams! });
            setName("");
            setGrams(undefined);
          }}
        >
          Add
        </button>
      </div>
    </div>
  );
}
