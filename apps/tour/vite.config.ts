import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
  plugins: [
    // Tailwind v4 via its first-party Vite plugin (not @tailwindcss/postcss):
    // CSS @imports and their url() asset deps go through Vite's asset pipeline,
    // so they are rebased and emitted. The PostCSS integration inlines @imports
    // before Vite resolves urls, silently dropping referenced font/image files.
    tailwindcss(),
    // importProtection is the build-time guard that blocks `**/*.server.*` files
    // from being imported into client code by FILENAME. It's disabled because our
    // route files import `createServerFn`-wrapped helpers from `*.server.ts`
    // (e.g. `fetchMe`, `signIn`) — those compile to client-safe RPC stubs, so the
    // filename guard is a false positive. The real server/client boundary is
    // `createServerFn` itself: the verified-clean client bundle contains none of
    // LIFE_URL / graphql-admin / api-auth / getRequestHeader. Re-enable if a
    // future change lets a raw server-only module reach a component.
    tanstackStart({ importProtection: { enabled: false } }),
    // Bundles the app into a standalone Node server (`.output/server/index.mjs`,
    // the container's entrypoint). Without it the build emits a web-fetch handler,
    // not a runnable server. `node-server` is nitro's default preset.
    nitro(),
    viteReact(),
  ],
  resolve: {
    alias: {
      '@workspace/ui/globals.css': resolve(__dirname, '../../packages/ui/src/styles/globals.css'),
      '@workspace/ui': resolve(__dirname, '../../packages/ui/src'),
    },
  },
})
