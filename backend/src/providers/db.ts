import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "../config/env";
import { sqlFilterForDialect } from "@danielsharp/drizzle";

const pool = new Pool({
  connectionString: env.DATABASE_URL,
});

export const db = drizzle({ client: pool });

export type Db = typeof db;

export const { sqlFilter, sqlFilters, filtersForColumns } =
  sqlFilterForDialect("postgresql");
