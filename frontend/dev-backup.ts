import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Plugin } from "vite";

const ROUTE = "/__dash/backup";

/**
 * Dev-only stand-in for cloud sync: one JSON file on this machine that any device on the LAN can
 * save to or load from. Last write wins; there is no merging.
 */
export function devBackup(dir = ".dash-backup"): Plugin {
  const file = path.resolve(dir, "backup.json");
  return {
    name: "dash-dev-backup",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(ROUTE, async (req, res) => {
        try {
          if (req.method === "GET") {
            const body = await readFile(file, "utf8").catch(() => null);
            res.statusCode = body ? 200 : 404;
            res.setHeader("Content-Type", "application/json");
            res.end(body ?? "{}");
            return;
          }
          if (req.method === "PUT") {
            const chunks: Buffer[] = [];
            for await (const chunk of req) chunks.push(chunk as Buffer);
            const body = Buffer.concat(chunks).toString("utf8");
            const parsed = JSON.parse(body);
            if (parsed?.app !== "dash") throw new Error("Not a Dash export");
            await mkdir(path.dirname(file), { recursive: true });
            await writeFile(file, body);
            res.statusCode = 204;
            res.end();
            return;
          }
          res.statusCode = 405;
          res.end();
        } catch (e) {
          res.statusCode = 400;
          res.end(String(e));
        }
      });
    },
  };
}
