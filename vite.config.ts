import { defineConfig } from 'vite';
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
});
