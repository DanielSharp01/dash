import "dotenv/config";
import { z } from "zod";
import { zodStringify } from "@danielsharp/zod";

export const env = zodStringify(
  z.object({
    GOOGLE_CLIENT_ID: z.string(),
    GOOGLE_CLIENT_SECRET: z.string(),
    PORT: z.number().default(4000),
    /** 0.0.0.0 inside a container, so the published port reaches the server. */
    HOST: z.string().default("localhost"),
    REDIS_URL: z.string(),
    DATABASE_URL: z.string(),
    /** The origin the browser sees, e.g. https://dash.example.com; sign-in redirects back to it. */
    API_HOST: z.url().transform((u) => u.replace(/\/+$/, "")),
    OFF_USER_AGENT: z.string().default("Dash/0.1 (personal nutrition tracker)"),
    /** The built frontend (frontend/dist); unset in development, where Vite serves it. */
    FRONTEND_DIR: z.string().optional(),
    /** Overrides the drizzle folder, which the bundled server can't find next to its source. */
    MIGRATIONS_DIR: z.string().optional(),
    MIGRATE_ON_START: z.boolean().default(false),
  }),
).parse(process.env);
