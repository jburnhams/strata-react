import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Storybook's own Vite config, so the library build's lib mode and d.ts plugin stay out of it.
export default defineConfig({ plugins: [react(), tailwindcss()] });
