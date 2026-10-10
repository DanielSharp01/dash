import { deepEqual } from "@dash/core";
import { db } from "../providers/db";
import { logger } from "../providers/logger";
import { insertActivity, loadActivity, updateActivity } from "../repositories/activity.repo";
import { insertFood, loadFood, updateFood } from "../repositories/food.repo";
import { publicActivities, publicFoods } from "./definitions";
import { publicId } from "./publicId";

export const publicFoodId = (key: string) => publicId(key);
export const publicActivityId = (key: string) => publicId(`activity:${key}`);

/** Makes every public row match its definition exactly; a change bumps the row's revision. */
export async function seedPublicItems() {
  let changed = 0;
  await db.transaction(async (tx) => {
    for (const def of publicFoods) {
      const id = publicFoodId(def.key);
      const input = { ...def.food, id };
      const stored = await loadFood(tx, id);
      if (!stored) {
        await insertFood(tx, { userId: null, publicKey: def.key, starter: def.starter }, input);
        changed++;
        continue;
      }
      const { revision, deleted: _d, public: _p, starter, ...current } = stored;
      if (deepEqual(current, input) && starter === def.starter) continue;
      await updateFood(tx, input, { revision: revision + 1, deleted: false }, { starter: def.starter });
      changed++;
    }
    for (const def of publicActivities) {
      const id = publicActivityId(def.key);
      const input = { ...def.activity, id };
      const stored = await loadActivity(tx, id);
      if (!stored) {
        await insertActivity(tx, { userId: null, publicKey: def.key, starter: def.starter }, input);
        changed++;
        continue;
      }
      const { revision, deleted: _d, public: _p, starter, ...current } = stored;
      if (deepEqual(current, input) && starter === def.starter) continue;
      await updateActivity(tx, input, { revision: revision + 1, deleted: false }, { starter: def.starter });
      changed++;
    }
  });
  if (changed) logger.info(`Public items: ${changed} created or updated`);
}
