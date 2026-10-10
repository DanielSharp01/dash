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

export default defineConfig(({ mode }) => {
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
    plugins: [pageFallback(), react(), ...(https ? [basicSsl()] : [])],
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
