import { defineConfig } from "tsdown";

export default defineConfig({
  entry: "src/index.ts",
  format: "esm",
  platform: "node",
  dts: false,
  sourcemap: true,
  // The workspace package ships TypeScript source, so it is bundled rather than imported at runtime.
  deps: { alwaysBundle: ["@dash/core"] },
});
