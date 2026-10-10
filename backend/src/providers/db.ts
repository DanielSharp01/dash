import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "../config/env";
import { sqlFilterForDialect } from "@danielsharp/drizzle";

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
});

export const db = drizzle({ client: pool, casing: "snake_case" });

export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** Repositories take either, so a service can run several of them in one transaction. */
export type Executor = Db | Tx;

export const { sqlFilter, sqlFilters, filtersForColumns } =
  sqlFilterForDialect("postgresql");
