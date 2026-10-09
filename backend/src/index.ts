import { defaultErrorHandler } from "@danielsharp/typeline-http";
import { authErrorMapper } from "@danielsharp/http-auth";
import { controllers } from "./controllers";
import { rootRouter } from "./routers";
import { env } from "./config/env";
import { logger } from "./providers/logger";
import { initializeRedis } from "./providers/redis";

controllers();

await initializeRedis();

rootRouter.compile();
const server = await rootRouter.mount({
  onError: defaultErrorHandler((error) => {
    logger.error("Error", error as any);
    return authErrorMapper(error) ?? undefined;
  }),
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
