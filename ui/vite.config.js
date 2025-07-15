/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
import path from 'path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // root: '.', // Implicit, as vite.config.js is in ui/
  build: {
    // Output directory relative to project root (where package.json is)
    // Vite's `--root ui` in the build script sets the context for this config.
    // So, this path is relative to `ui/`. We want it to go one level up, then into `dist/ui`.
    outDir: path.resolve(__dirname, '../dist/ui'),
    // assetsDir: 'assets', // Default is 'assets'
    // sourcemap: true, // Enable for production debugging if needed
    base: '/', // Adjust if app is served from a sub-path like /ui/ in production
    rollupOptions: {
      external: ['@fortawesome/fontawesome-svg-core'],
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.js', // Relative to ui/
    css: true,
  },
});
