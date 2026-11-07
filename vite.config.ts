import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import dts from "vite-plugin-dts";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const external = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.peerDependencies ?? {})];

// Library build: ESM only, every dependency and peer left external (the app's bundler dedupes
// React, the router and the query client). CSS is not bundled: dist/strata.css is Tailwind
// source the app compiles with its own theme (scripts/copy-css.mjs).
export default defineConfig({
  plugins: [react(), dts({ include: ["src"], entryRoot: "src" })],
  build: {
    lib: {
      entry: { index: resolve(__dirname, "src/index.ts"), testing: resolve(__dirname, "src/testing/index.tsx") },
      formats: ["es"],
    },
    sourcemap: true,
    minify: false,
    rollupOptions: {
      external: (id) => external.some((dep) => id === dep || id.startsWith(`${dep}/`)) || id.startsWith("react/"),
    },
  },
});
