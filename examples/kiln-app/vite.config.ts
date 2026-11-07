import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

// Built under a base path, as an app published to GitHub Pages is, so the visual suite's base
// handling is tested too.
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  base: "/kiln/",
  plugins: [react(), tailwindcss()],
  build: { outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 2000 },
});
