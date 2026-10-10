import "dotenv/config";
import { z } from "zod";
import { zodStringify } from "@danielsharp/zod";

export const env = zodStringify(
  z.object({
    GOOGLE_CLIENT_ID: z.string(),
    GOOGLE_CLIENT_SECRET: z.string(),
    PORT: z.number().default(4000),
    REDIS_URL: z.string(),
    DATABASE_URL: z.string(),
    OFF_USER_AGENT: z.string().default("Dash/0.1 (personal nutrition tracker)"),
  }),
).parse(process.env);
