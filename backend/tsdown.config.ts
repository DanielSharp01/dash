import { defineConfig } from "tsdown";

export default defineConfig({
  entry: "src/index.ts",
  format: "cjs",
  platform: "node",
  dts: false,
  sourcemap: true,
});
