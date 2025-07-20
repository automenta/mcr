import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
	build: {
		outDir: 'dist/ui',
		emptyOutDir: true,
	},
});
