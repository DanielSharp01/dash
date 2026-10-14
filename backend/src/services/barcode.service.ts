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

/**
 * GS1 leaves 02x, 04x and 2xx to shops, so the same number is a different product in each one. A UPC-A code is the EAN-13 without its leading 0.
 * Weighed items fall in this range too, with the weight or price in the number; matching them by item code alone needs per-retailer layouts, so they're not supported.
 */
// TODO: Normalise codes to 13 digits and expand UPC-E so US-style scans of one product share a cache key and match the same own foods.
function isStoreCode(code: string) {
  const ean13 = code.length === 12 ? `0${code}` : code;
  return /^(0[24]|2\d)\d{11}$/.test(ean13);
}

async function cachedLookup(code: string): Promise<OpenFoodFactsResult | undefined> {
  if (isStoreCode(code)) return undefined;
  // The version changes with the cached shape; old keys just expire.
  const key = `off:v2:${code}`;
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
