import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { env } from "../config/env";
import { db, pool } from "../providers/db";

export const migrationsFolder = env.MIGRATIONS_DIR ?? fileURLToPath(new URL("../../drizzle", import.meta.url));

export async function runMigrations() {
  await migrate(db, { migrationsFolder });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runMigrations();
  await pool.end();
}
