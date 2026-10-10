import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

// The e2e suite points `vite preview` at its own API instance.
const apiTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [
    // Must run before the React plugin: generates src/routeTree.gen.ts from src/routes.
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
      // Tests may live next to routes without becoming routes.
      routeFileIgnorePattern: '\\.test\\.',
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // Fail instead of silently moving to another port (the origin matters for cookies).
    strictPort: true,
    // Same origin for browser and API in dev: no CORS, cookies just work.
    proxy: {
      '/api': apiTarget,
    },
  },
  // `vite preview` reuses server.proxy; a fixed port so the e2e suite knows where to look.
  preview: {
    port: 4173,
    strictPort: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    // Form tests type whole passwords with user-event; slow shared CI runners need headroom.
    testTimeout: 15_000,
  },
});
