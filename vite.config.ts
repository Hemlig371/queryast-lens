import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {fileURLToPath} from 'node:url';
import { defineConfig } from 'vite';
import {rm} from 'node:fs/promises';
import {patchPerspectiveNumberLocale} from './scripts/patch-perspective-number-locale.mjs';

const projectRoot=path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(async () => {
  // Also prepare on Vite startup/restart: replacing sources in a running dev
  // session does not rerun npm predev. Config changes do restart Vite.
  if (await patchPerspectiveNumberLocale()) {
    await rm(path.resolve(projectRoot,'node_modules/.vite'),{recursive:true,force:true});
  }
  return {
    base: './',
    // Keep the added runtime export out of stale dependency prebundles.
    optimizeDeps: {exclude:['@perspective-dev/viewer/column-format']},
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(projectRoot, '.'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'react-vendor': ['react', 'react-dom'],
            'flow-vendor': ['@xyflow/react', '@xyflow/system'],
            'sql-vendor': ['node-sql-parser'],
            'codemirror-vendor': ['@codemirror/state', '@codemirror/view', '@codemirror/commands', '@codemirror/language', '@lezer/highlight'],
            'lucide': ['lucide-react']
          },
        },
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: 'all',
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
