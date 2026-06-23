/**
 * `life` app — pure h3 + Effect 4 entry point built on `@czo/kit`'s
 * `buildApp` / `runApp`.
 *
 * Bootstrap is now just:
 *   1. Validate env (AUTH_SECRET).
 *   2. `buildApp({ modules, … })` — pure layer composition.
 *   3. `runApp(built, { runMain, … })` — runs via the Node runner (kit is
 *      platform-agnostic; `./runtime` supplies the Node bindings).
 *
 * Notes:
 *  - `/health` is mounted via the `httpApp` factory (no runtime needed).
 *  - `/api/auth/**` is mounted by the auth module's `http` hook.
 *  - Telemetry: Effect-native OTLP export (`Otlp.layerProtobuf`) over HTTP to
 *    an OpenTelemetry Collector, enabled when `OTEL_EXPORTER_OTLP_ENDPOINT` is
 *    set. Passed as `runApp`'s runtime layer so the captured request context
 *    carries the Tracer/Logger/Metrics into every resolver. Captures Effect
 *    spans (services, resolvers, `@effect/sql-pg` queries); HTTP-server root
 *    spans would need the `@opentelemetry` http instrumentation (not wired).
 */
import process from 'node:process'

import { useLogger } from '@czo/kit'
import * as Email from '@czo/kit/email/smtp'
import { buildApp, runApp } from '@czo/kit/module'
import { JobQueueLiveFromEnv } from '@czo/kit/queue'
import { Layer } from 'effect'
import { FetchHttpClient } from 'effect/unstable/http'
import { Otlp } from 'effect/unstable/observability'
import { defineHandler, H3 } from 'h3'

import { modules } from './modules'
import { dotEnvConfigProvider, runMain } from './runtime'

const logger = useLogger('life:bootstrap')

// ─── 1. Config ───────────────────────────────────────────────────────────────

const authSecret = process.env.AUTH_SECRET ?? 'hvAcEau3mQZfLC48zhO9WUy4r4A3JuHW2Dkx8SdMb8QDR3XupjSOAyXBmrOKd5qJ'
if (!authSecret || authSecret.length < 32) {
  logger.error('AUTH_SECRET missing or shorter than 32 chars — refusing to start.')
  process.exit(1)
}

// The auth module reads its config from the environment via Effect `Config`.
// main.ts is the single env-resolution point: propagate the resolved (or
// dev-fallback) secret and the app id so the module's `Config` picks them up.
process.env.AUTH_SECRET = authSecret
process.env.AUTH_APP ??= 'life'

// ─── 2. Build app ────────────────────────────────────────────────────────────

const built = buildApp({
  modules,
  // Host-provided EmailService transport. `fromEnv` reads EMAIL_TRANSPORT:
  // `smtp` → nodemailer (needs SMTP_HOST/PORT/EMAIL_FROM, optional SMTP_USER/
  // SMTP_PASSWORD/SMTP_SECURE); anything else (default) → dev logging transport.
  services: Layer.mergeAll(Email.fromEnv, JobQueueLiveFromEnv),
  http: {
    port: Number(process.env.PORT ?? 4000),
    hostname: process.env.HOST ?? '127.0.0.1',
  },
  openapi: {
    title: 'life API',
    version: '0.1.0',
    description: 'REST endpoints for the life app.',
    // jsonPath/uiPath default to /openapi.json and /reference.
    // Gated off when NODE_ENV === 'production'.
  },
  subGraphs: ['public', 'account', 'org', 'admin'],
  // Pre-mount routes that need no runtime access. Anything requiring
  // module services per request should live in the owning module's
  // `http` hook.
  httpApp: () => {
    const app = new H3()
    app.get('/health', defineHandler(() => ({ ok: true, app: 'life' })))
    return app
  },
})

logger.success(
  `life modules ready (${built.modules.length}: ${built.modules.map(m => m.name).join(', ')})`,
)

// ─── 3. Telemetry (optional, OTLP/HTTP → collector) ──────────────────────────

// Effect-native OTLP exporter for logs + metrics + traces. `layerProtobuf`
// posts to `${baseUrl}/v1/{logs,metrics,traces}`; `FetchHttpClient` (global
// fetch, Node 24) satisfies its only requirement. Skipped when no endpoint is
// configured so local dev stays quiet.
const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT
const telemetryLayer = otlpEndpoint
  ? Otlp.layerProtobuf({
      baseUrl: otlpEndpoint,
      resource: {
        serviceName: process.env.OTEL_SERVICE_NAME ?? 'life',
        serviceVersion: '0.1.0',
      },
    }).pipe(Layer.provide(FetchHttpClient.layer))
  : undefined

if (telemetryLayer)
  logger.info(`telemetry: OTLP export → ${otlpEndpoint}`)

// ─── 4. Run ──────────────────────────────────────────────────────────────────

runApp(built, { runMain, configProvider: dotEnvConfigProvider, runtimeLayer: telemetryLayer })
