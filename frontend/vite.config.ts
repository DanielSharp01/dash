import { resolve } from "node:path";
import { defineConfig, loadEnv, type Plugin, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";

// Phones only grant camera access on a secure origin, so LAN testing needs HTTPS.
const https = process.env.HTTPS === "1";

/** Deep links inside the capture app get its page, and /login gets the sign-in page, not the root one. */
function pageFallback(): Plugin {
  const rewrite = (url = "") => {
    if (/^\/capture(\/[^.]*)?(\?.*)?$/.test(url)) return "/capture/index.html";
    if (/^\/login\/?(\?.*)?$/.test(url))
      return url.replace(/^\/login\/?/, "/login/index.html");
    return url;
  };
  return {
    name: "dash-page-fallback",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        req.url = rewrite(req.url);
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, _res, next) => {
        req.url = rewrite(req.url);
        next();
      });
    },
  };
}

/**
 * Stamps the bundle and dist/version.json with the same build id, so an open tab can tell a
 * deploy happened. The Docker build has no .git, hence a timestamp unless BUILD_ID is set.
 * The dev server serves its own version.json; opening /__dev/bump-version fakes a deploy.
 */
function buildVersion(command: "build" | "serve"): Plugin {
  const id = command === "serve" ? "dev" : (process.env.BUILD_ID ?? new Date().toISOString());
  let served = id;
  return {
    name: "dash-build-version",
    config: () => ({ define: { __BUILD_ID__: JSON.stringify(id) } }),
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === "/__dev/bump-version") {
          served = `dev-${Date.now()}`;
          res.end("Version bumped. Switch back to the app's tab to see the update notice.");
        } else if (req.url?.startsWith("/version.json")) {
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ build: served }));
        } else {
          // A page load is the reload that "installs" the fake deploy, since the bundle stays "dev".
          if (req.headers.accept?.includes("text/html")) served = id;
          next();
        }
      });
    },
    generateBundle() {
      if (command === "build") this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ build: id }) });
    },
  };
}

export default defineConfig(({ command, mode }) => {
  // Same origin through the proxy: no CORS, and the __Host- auth cookie works.
  // The "" prefix also loads PROXY_SESSION, which stays unprefixed so it can never reach the bundle.
  const env = loadEnv(mode, process.cwd(), "");
  const target = env.VITE_PROXY_API_URL || "http://localhost:4000";
  // Sign-in can't complete through the proxy (Google calls back to the backend's own host), so against
  // a remote backend we borrow a session: the __Host-auth cookie value copied from that site.
  const session = env.PROXY_SESSION;
  const route: ProxyOptions = {
    target,
    changeOrigin: true,
    headers: session ? { cookie: `__Host-auth=${session}` } : undefined,
  };
  const proxy = { "/api": route, "/auth": route };
  return {
    plugins: [pageFallback(), buildVersion(command), react(), ...(https ? [basicSsl()] : [])],
    server: { proxy },
    preview: { proxy },
    build: {
      rollupOptions: {
        input: {
          main: resolve(import.meta.dirname, "index.html"),
          capture: resolve(import.meta.dirname, "capture/index.html"),
          login: resolve(import.meta.dirname, "login/index.html"),
        },
      },
    },
  };
});
