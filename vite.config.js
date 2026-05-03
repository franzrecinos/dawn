import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { discoverEntries } from './build/discover-entries.js';
import { mirrorLiquid } from './build/mirror-liquid.js';
import { copyScripts } from './build/copy-scripts.js';

export default defineConfig({
  plugins: [tailwindcss(), mirrorLiquid(), copyScripts()],
  build: {
    outDir: 'assets',
    emptyOutDir: false,
    cssCodeSplit: true,
    manifest: false,
    rollupOptions: {
      input: discoverEntries(),
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name][extname]',
      },
    },
  },
});
