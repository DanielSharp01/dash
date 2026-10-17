import type { Recipe } from "@dash/core";
import { batchLabel, finishedBatches } from "../foods";

export function BatchChoice({ recipe, batchId, onChange }: { recipe: Recipe; batchId?: string; onChange: (id: string) => void }) {
  const batches = finishedBatches(recipe).reverse();
  if (batches.length < 2) return null;
  return (
    <div className="chip-row" role="radiogroup" aria-label="Batch">
      {batches.slice(0, 4).map((b) => (
        <button key={b.id} role="radio" aria-checked={b.id === batchId} className="chip" onClick={() => onChange(b.id)}>
          {b.shared ? "Shared" : batchLabel(b)}
        </button>
      ))}
    </div>
  );
}
