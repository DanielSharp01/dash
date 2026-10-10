import type { TestProject } from "vitest/node";
import pg from "pg";

/** Recreates the test database, migrates it and seeds the public items once for every test file. */
export default async function setup(project: TestProject) {
  const testUrl = new URL(project.config.env.DATABASE_URL!);
  const database = testUrl.pathname.slice(1);
  const admin = new URL(testUrl);
  admin.pathname = "/postgres";
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  await client.query(`drop database if exists "${database}" with (force)`);
  await client.query(`create database "${database}"`);
  await client.end();

  Object.assign(process.env, project.config.env);
  const { runMigrations } = await import("../../src/db/migrate");
  const { seedPublicItems } = await import("../../src/seeds");
  const { pool } = await import("../../src/providers/db");
  await runMigrations();
  await seedPublicItems();
  await pool.end();
}
