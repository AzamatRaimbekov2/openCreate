// apps/web/vite.config.ts
// Vite + Vitest config: TanStack Router codegen, React, Tailwind v4, path aliases,
// dev proxy to the API on :8787 (same-origin /api + /media — no CORS in dev),
// and the jsdom test environment for component tests.
// `defineConfig` comes from 'vitest/config' so the `test` block is typed.
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  // Router plugin must run before react() so route-tree codegen happens first
  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
      // Co-located tests in src/routes must never become routes
      routeFileIgnorePattern: '\\.test\\.(ts|tsx)$',
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    // Path aliases — mirror of tsconfig `paths`; relative `../../..` imports are banned
    alias: {
      modules: fileURLToPath(new URL('./src/modules', import.meta.url)),
      shared: fileURLToPath(new URL('./src/shared', import.meta.url)),
      routes: fileURLToPath(new URL('./src/routes', import.meta.url)),
    },
  },
  server: {
    proxy: {
      // Fastify API — cookies stay first-party because the origin is shared
      '/api': 'http://localhost:8787',
      // Generated media files served by the API's local storage provider
      '/media': 'http://localhost:8787',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test-setup.ts',
    globals: true,
  },
})
