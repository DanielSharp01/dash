import { resolve } from "node:path";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";

// Phones only grant camera access on a secure origin, so LAN testing needs HTTPS.
const https = process.env.HTTPS === "1";

/** Deep links inside the capture app get its page, and /login gets the sign-in page, not the root one. */
function pageFallback(): Plugin {
  const rewrite = (url = "") => {
    if (/^\/capture(\/[^.]*)?(\?.*)?$/.test(url)) return "/capture/index.html";
    if (/^\/login\/?(\?.*)?$/.test(url)) return url.replace(/^\/login\/?/, "/login/index.html");
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
  const api = loadEnv(mode, process.cwd(), "VITE_").VITE_PROXY_API_URL || "http://localhost:4000";
  const proxy = { "/api": api, "/auth": api };
  return {
    plugins: [pageFallback(), react(), ...(https ? [basicSsl()] : [])],
    server: { proxy },
    preview: { proxy },
    build: {
      rollupOptions: {
        input: {
          main: resolve(__dirname, "index.html"),
          capture: resolve(__dirname, "capture/index.html"),
          login: resolve(__dirname, "login/index.html"),
        },
      },
    },
  };
});
