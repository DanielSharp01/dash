import type { TestProject } from "vitest/node";
import pg from "pg";

/** Recreates the test database, migrates it and seeds the public items once for every test file. */
export default async function setup(project: TestProject) {
  const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME: database } = project.config.env;
  const client = new pg.Client({ host: DB_HOST, port: Number(DB_PORT), user: DB_USER, password: DB_PASSWORD, database: "postgres" });
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
