import { useState } from "react";
import type { Food, FoodItem } from "@dash/core";
import { ItemEditor } from "../editors/ItemEditor";
import { blankItem } from "../foods";
import { FoodSearch } from "./FoodSearch";
import { Sheet } from "./Sheet";

/** Picks a part or ingredient; one that isn't in the catalogue yet is created right here, unsure until its label is in. */
export function AddFoodSheet({
  title,
  kinds,
  excludeId,
  onPick,
  onClose,
}: {
  title: string;
  kinds: Food["kind"][];
  excludeId?: string;
  onPick: (f: Food) => void;
  onClose: () => void;
}) {
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
          excludeId={excludeId}
          recentIds={[]}
          placeholder={kinds.includes("recipe") ? "Search your items and recipes" : "Search your items"}
          onPick={onPick}
          onNew={(name) => setCreating(blankItem(name, { unsure: true }))}
        />
      )}
    </Sheet>
  );
}
