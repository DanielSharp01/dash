/**
 * Stores keep their state in memory and render synchronously; IndexedDB sits behind them.
 * Everything is read once before the app mounts, and every change is written through.
 */
import { BEGINNING } from "./types";

// Its own database, so a dashboard on the same origin can never read or clear capture data.
const DB = "dash-capture";
const STORE = "kv";
const EXPORT_VERSION = 3;

const cache = new Map<string, unknown>();
let db: IDBDatabase | undefined;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    if (!db) return resolve(undefined);
    const t = db.transaction(STORE, mode);
    const req = run(t.objectStore(STORE));
    t.oncomplete = () => resolve(req ? req.result : undefined);
    t.onerror = () => reject(t.error);
  });
}

export async function hydrate() {
  try {
    db = await open();
    // Without this, mobile browsers may clear the data under storage pressure.
    await navigator.storage?.persist?.();
    const store = db.transaction(STORE).objectStore(STORE);
    const [keys, values] = await Promise.all([request(store.getAllKeys()), request(store.getAll())]);
    const upgraded = keys.map((k, i): [string, unknown] => [String(k), upgrade(values[i])]);
    upgraded.forEach(([k, v]) => cache.set(k, v));
    await tx("readwrite", (s) => upgraded.forEach(([k, v]) => s.put(v, k)));
  } catch {
    // Private windows can refuse IndexedDB; the app still runs, in memory only.
  }
}

const request = <T>(r: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

export function read<T>(key: string, fallback: T): T {
  return cache.has(key) ? (cache.get(key) as T) : fallback;
}

export function write(key: string, value: unknown) {
  cache.set(key, value);
  tx("readwrite", (s) => s.put(value, key)).catch(() => {});
}

export function exportData() {
  return { app: "dash", version: EXPORT_VERSION, exportedAt: new Date().toISOString(), data: Object.fromEntries(cache) };
}

/** Version 2 wrote "" for a label or plan version with no start date; only those objects have a stored `from`. */
function upgrade(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(upgrade);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, k === "from" && v === "" ? BEGINNING : upgrade(v)]));
}

/** Replaces everything; the caller reloads so every store starts from the imported data. */
export async function importData(file: unknown) {
  const parsed = file as ReturnType<typeof exportData>;
  if (parsed?.app !== "dash" || (parsed.version !== 2 && parsed.version !== EXPORT_VERSION) || typeof parsed.data !== "object") throw new Error("Not a Dash export");
  await tx("readwrite", (s) => {
    s.clear();
    for (const [k, v] of Object.entries(parsed.data)) s.put(upgrade(v), k);
  });
}
