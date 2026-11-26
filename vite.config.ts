import { defineConfig } from "vite-plus";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const external = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.peerDependencies ?? {})];

// Library build is `vp pack` (tsdown, the `pack` block below): ESM only with bundled .d.ts, every
// dependency and peer left external (the app's bundler dedupes React, the router and the query client).
// CSS is not bundled: dist/strata.css is Tailwind source the app compiles with its own theme
// (scripts/copy-css.mjs). The visual entries run in Node (the strata-visual command), so Node's
// built-ins stay external too. The `plugins` block is for Vitest (JSX in tests), not for the build.
export default defineConfig({
  // One toolchain (Vite+): `vp lint` is Oxlint, `vp fmt` is Oxfmt. Width 120 and double quotes are the
  // style the code was already written in, so adopting the formatter does not rewrite the tree.
  lint: {
    // Copying a Set or Map before looping is deliberate where the loop body changes it; test doubles alias `this`.
    rules: { "unicorn/no-useless-spread": "off", "typescript/no-this-alias": "off" },
    ignorePatterns: [".storybook/public/**", "dist/**", "storybook-static/**", "site/**", "tests/visual/**"],
  },
  fmt: {
    printWidth: 120,
    ignorePatterns: [
      "CHANGELOG.md",
      "UPGRADING.md",
      "*.md",
      "*.css",
      "*.json",
      "tests/visual/**",
      ".storybook/public/**",
      "site/**",
      "dist/**",
    ],
  },
  pack: {
    entry: {
      index: "src/index.ts",
      testing: "src/testing/index.tsx",
      map: "src/map/index.ts",
      hls: "src/hls/index.ts",
      panorama: "src/panorama/index.ts",
      scene: "src/scene/index.ts",
      visual: "src/visual/index.ts",
      "visual-cli": "src/visual/cli.ts",
      "api-types": "src/api-types/index.ts",
      "api-types-cli": "src/api-types/cli.ts",
      "migrate-cli": "src/migrate/cli.ts",
    },
    format: "esm",
    dts: true,
    sourcemap: true,
    minify: false,
    clean: false,
    outDir: "dist",
    outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
    deps: { neverBundle: [...external.map((d) => new RegExp(`^${d}(/|$)`)), /^react\//, /^node:/] },
  },
  plugins: [react()],
});
