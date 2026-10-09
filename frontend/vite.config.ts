import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { devBackup } from "./dev-backup";

// Phones only grant camera access on a secure origin, so LAN testing needs HTTPS.
const https = process.env.HTTPS === "1";

export default defineConfig({
  plugins: [react(), devBackup(), ...(https ? [basicSsl()] : [])],
});
