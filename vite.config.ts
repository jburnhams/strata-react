import { defineConfig } from 'vitest/config';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'MyLibrary',
      fileName: (format) => {
        if (format === 'cjs') return `my-library.cjs`;
        if (format === 'es') return `my-library.js`;
        return `my-library.${format}.js`;
      },
      formats: ['es', 'cjs', 'iife'],
    },
    sourcemap: true,
    minify: true,
    rollupOptions: {},
  },
  plugins: [
    dts({
      exclude: ['**/*.test.ts', 'tests/**'],
      rollupTypes: true
    })
  ],
  test: {
    environment: 'happy-dom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      exclude: ['docs/**', 'scripts/**', 'tests/**', 'dist/**'],
    },
    include: ['tests/**/*.test.ts'],
  },
});
