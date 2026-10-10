import { useState } from "react";
import type { Food, FoodItem } from "@dash/core";
import { ItemEditor } from "../editors/ItemEditor";
import { blankItem } from "../foods";
import { FoodSearch } from "./FoodSearch";
import { Sheet } from "./Sheet";

/** Picks a part or ingredient; one that isn't in the catalogue yet is created right here, unsure until its label is in. */
export function AddFoodSheet({ title, kinds, onPick, onClose }: { title: string; kinds: Food["kind"][]; onPick: (f: Food) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState<FoodItem>();

  return (
    <Sheet title={creating ? "New item" : title} onClose={onClose}>
      {creating ? (
        <ItemEditor item={creating} onSaved={onPick} />
      ) : (
        <FoodSearch
          query={query}
          onQuery={setQuery}
          kinds={kinds}
          recentIds={[]}
          placeholder="Search your items"
          onPick={onPick}
          onNew={(name) => setCreating(blankItem(name, { unsure: true }))}
        />
      )}
    </Sheet>
  );
}
