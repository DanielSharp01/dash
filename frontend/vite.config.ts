import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { devBackup } from "./dev-backup";

// Phones only grant camera access on a secure origin, so LAN testing needs HTTPS.
const https = process.env.HTTPS === "1";

/** Deep links inside the capture app get its page, not the root one that the default fallback serves. */
function captureFallback(): Plugin {
  const rewrite = (url = "") => (/^\/capture(\/[^.]*)?(\?.*)?$/.test(url) ? "/capture/index.html" : url);
  return {
    name: "dash-capture-fallback",
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

export default defineConfig({
  plugins: [captureFallback(), react(), devBackup(), ...(https ? [basicSsl()] : [])],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        capture: resolve(__dirname, "capture/index.html"),
      },
    },
  },
});
