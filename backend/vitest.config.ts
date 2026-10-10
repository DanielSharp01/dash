import "dotenv/config";
import { defineConfig } from "vitest/config";

/** Tests run against a throwaway database next to the dev one, recreated on every run. */
function testDatabaseUrl() {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = "/dash_test";
  return url.toString();
}

export default defineConfig({
  test: {
    // Domain logic is unit-tested in @dash/core. Here, integration tests (repositories, seeds,
    // constraints) and e2e tests (HTTP endpoints) share one database and the setup that recreates it.
    include: ["test/integration/**/*.test.ts", "test/e2e/**/*.test.ts"],
    globalSetup: ["./test/support/globalSetup.ts"],
    env: {
      DATABASE_URL: testDatabaseUrl(),
      REDIS_URL: process.env.TEST_REDIS_URL ?? `${process.env.REDIS_URL ?? "redis://localhost:6379"}/15`,
    },
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
