import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, './shared'),
    },
  },
  build: {
    outDir: '../dist/ui',
    emptyOutDir: true,
  },
});
