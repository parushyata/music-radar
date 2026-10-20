import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'web',
  plugins: [react()],
  build: { outDir: '../dist', emptyOutDir: true },
  server: {
    port: 5173,
    // API and sign-in go to `wrangler dev`.
    proxy: { '/api': 'http://localhost:8787', '/auth': 'http://localhost:8787' },
  },
  test: {
    // `root: 'web'` above would make these patterns relative to web/, so point Vitest back at the repo root.
    // scripts/ tests use node:test and run with `node --test` instead.
    root: '.',
    include: ['web/**/*.test.ts', 'server/**/*.test.ts'],
  },
});
