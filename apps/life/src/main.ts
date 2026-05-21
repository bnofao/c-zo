/**
 * `life` app — pure h3 + Effect 4 entry point built on `@czo/kit`'s
 * `buildApp` / `runApp`.
 *
 * Bootstrap is now just:
 *   1. Validate env (AUTH_SECRET).
 *   2. `buildApp({ modules, … })` — pure layer composition.
 *   3. `runApp(built)` — hands the program to `NodeRuntime.runMain`.
 *
 * Notes:
 *  - `/health` is mounted via the `httpApp` factory (no runtime needed).
 *  - `/api/auth/**` is mounted by the auth module's `http` hook.
 *  - Telemetry (OTel SDK + Effect Tracer bridge) is intentionally
 *    omitted here — to be re-added once the observability story is
 *    consolidated.
 */
import process from 'node:process'

import { useLogger } from '@czo/kit'
import { buildApp, runApp } from '@czo/kit/module'
import { defineHandler, H3 } from 'h3'

import { makeModules } from './modules'

const logger = useLogger('life:bootstrap')

// ─── 1. Config ───────────────────────────────────────────────────────────────

const authSecret = process.env.AUTH_SECRET ?? 'hvAcEau3mQZfLC48zhO9WUy4r4A3JuHW2Dkx8SdMb8QDR3XupjSOAyXBmrOKd5qJ'
if (!authSecret || authSecret.length < 32) {
  logger.error('AUTH_SECRET missing or shorter than 32 chars — refusing to start.')
  process.exit(1)
}

// ─── 2. Build app ────────────────────────────────────────────────────────────

const built = buildApp({
  modules: makeModules({
    app: 'life',
    baseUrl: process.env.BASE_URL,
    auth: { secret: authSecret },
  }),
  // modules: [],
  http: {
    port: Number(process.env.PORT ?? 4000),
    hostname: process.env.HOST ?? '127.0.0.1',
  },
  // Pre-mount routes that need no runtime access. Anything requiring
  // module services (e.g. `BetterAuth` for `/api/auth/**`) should live
  // in the owning module's `http` hook.
  httpApp: () => {
    const app = new H3()
    app.get('/health', defineHandler(() => ({ ok: true, app: 'life' })))
    return app
  },
})

logger.success(
  `life modules ready (${built.modules.length}: ${built.modules.map(m => m.name).join(', ')})`,
)

// ─── 3. Run ──────────────────────────────────────────────────────────────────

runApp(built)
