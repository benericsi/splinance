import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { loadEnv, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

/**
 * Vite writes an imported asset to the output as soon as it loads the importing module,
 * before tree shaking. The landing page is dropped from production builds, but its tour
 * video and screenshots would still be emitted: remove the demo assets no chunk refers to.
 */
function dropUnusedDemoAssets(): Plugin {
  return {
    name: 'drop-unused-demo-assets',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = Object.values(bundle);
      const code = files.map((file) => (file.type === 'chunk' ? file.code : '')).join('\n');
      for (const file of files) {
        const demoAsset =
          file.type === 'asset' &&
          file.originalFileNames.some((name) => /src[\\/]assets[\\/]demo[\\/]/.test(name));
        if (demoAsset && !code.includes(file.fileName))
          Reflect.deleteProperty(bundle, file.fileName);
      }
    },
  };
}

// The e2e suite points `vite preview` at its own API instance.
const apiTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:3000';

const isDemoSite = (mode: string) =>
  mode === 'demo' ||
  (mode !== 'test' && loadEnv(mode, process.cwd(), 'VITE_').VITE_DEMO === 'true');

export default defineConfig(({ mode }) => ({
  // The demo site switch (`--mode demo` or VITE_DEMO=true) as a literal at every use: the bundler drops the dead branch and
  // with it every import only the demo uses (landing page, demo story), so production
  // bundles hold none of it. A constant exported from a module would not do: the bundler
  // does not fold imported constants, only the minifier does, after the imports are kept.
  // Vitest turns defines into real globals, so a test can switch it (test/demo-site.ts).
  define: {
    __DEMO_SITE__: JSON.stringify(isDemoSite(mode)),
  },
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
    dropUnusedDemoAssets(),
    // App shell only: nothing from /api is ever cached, so no financial data rests on the
    // device (architecture section 12, "Installable app").
    VitePWA({
      registerType: 'prompt',
      // Registered from src/features/pwa/register.ts: no inline script, no new CSP hash.
      injectRegister: false,
      manifest: {
        id: '/',
        name: isDemoSite(mode) ? 'Splinance demo' : 'Splinance',
        short_name: isDemoSite(mode) ? 'Splinance demo' : 'Splinance',
        description: 'Shared expenses, sorted.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#ffffff',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: '/pwa-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Not the demo's tour videos and screenshots, or font subsets for other alphabets.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        globIgnores: ['**/*-{cyrillic,cyrillic-ext,greek,greek-ext,vietnamese}-*.woff2'],
        navigateFallback: 'index.html',
        // OAuth callbacks and everything else under /api always reach the network.
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
      },
    }),
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
}));
