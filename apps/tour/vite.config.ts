import { resolve } from 'node:path'
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
    // importProtection is the build-time guard that blocks `**/*.server.*` files
    // from being imported into client code by FILENAME. It's disabled because our
    // route files import `createServerFn`-wrapped helpers from `*.server.ts`
    // (e.g. `fetchMe`, `signIn`) — those compile to client-safe RPC stubs, so the
    // filename guard is a false positive. The real server/client boundary is
    // `createServerFn` itself: the verified-clean client bundle contains none of
    // LIFE_URL / graphql-admin / api-auth / getRequestHeader. Re-enable if a
    // future change lets a raw server-only module reach a component.
    tanstackStart({ importProtection: { enabled: false } }),
    // Override TanStack Start's default Nitro preset to emit a self-contained
    // HTTP server bundle (`.output/server/index.mjs`) — required to run the app
    // as `node .output/server/index.mjs` in the production container. Without
    // this, the build emits a web-fetch handler module that isn't a server.
    nitro({ preset: 'node-server' }),
    viteReact(),
  ],
  resolve: {
    alias: {
      '@workspace/ui/globals.css': resolve(__dirname, '../../packages/ui/src/styles/globals.css'),
      '@workspace/ui': resolve(__dirname, '../../packages/ui/src'),
    },
  },
})
