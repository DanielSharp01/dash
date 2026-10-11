import { codecs } from "@danielsharp/redis";
import type { OpenFoodFactsResult } from "@dash/core";
import { logger } from "../providers/logger";
import { openFoodFacts } from "../providers/openFoodFacts";
import { redis } from "../providers/redis";
import { foodsWithBarcode } from "./food.service";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
// Products get added to Open Food Facts all the time, so a miss is remembered for less long.
const MISS_MS = 24 * 60 * 60 * 1000;

type Cached = { found: OpenFoodFactsResult | null };

async function cachedLookup(code: string): Promise<OpenFoodFactsResult | undefined> {
  const key = `off:${code}`;
  const cached = await redis.get(key, codecs.json<Cached>());
  if (cached) return cached.found ?? undefined;
  try {
    const found = await openFoodFacts.lookup(code);
    await redis.set(key, { found: found ?? null }, codecs.json<Cached>(), { expiration: { type: "PX", value: found ? WEEK_MS : MISS_MS } });
    return found;
  } catch (error) {
    // A lookup must never block capture; an outage just means no suggestion, and nothing is cached.
    logger.warn("Open Food Facts lookup failed", error as any);
    return undefined;
  }
}

/** Barcodes aren't unique, so a scan narrows the list; Open Food Facts is asked only when nothing matches. */
export async function lookupBarcode(userId: string, code: string) {
  const foods = await foodsWithBarcode(userId, code);
  if (foods.length) return { foods };
  const found = await cachedLookup(code);
  return found ? { foods, openFoodFacts: found } : { foods };
}

/** Asks Open Food Facts even when an item already has the code, so a saved item can be filled again. */
export async function productForBarcode(code: string) {
  const found = await cachedLookup(code);
  return found ? { openFoodFacts: found } : {};
}
