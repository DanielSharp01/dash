import { createApp, onError } from "./app";
import { env } from "./config/env";
import { initializeRedis } from "./providers/redis";
import { seedPublicItems } from "./seeds";

const app = createApp();

await initializeRedis();
await seedPublicItems();

const server = await app.mount({
  onError,
  port: env.PORT,
  hostname: "localhost",
});

console.info(`Server running at http://localhost:${env.PORT}/api`);
console.info(`Docs at http://localhost:${env.PORT}/api/docs`);

for (const event of ["SIGTERM", "SIGINT"] as const) {
  process.on(event, async () => {
    server.close();
    process.exit(0);
  });
}
