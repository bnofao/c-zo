/**
 * `life` worker process — drains durable job queues. Builds the same module
 * runtime as `main.ts` (DB + services) WITHOUT HTTP, provides the SQL-backed
 * `PersistedQueueFactory`, and forks every module's `queues` consumers. Run
 * with `pnpm --filter life worker`.
 */
import process from 'node:process'

import { useLogger } from '@czo/kit'
import * as Email from '@czo/kit/email/smtp'
import { buildRuntime, runWorker } from '@czo/kit/module'
import { JobQueueLiveFromEnv } from '@czo/kit/queue'
import { Effect, Layer } from 'effect'

import { modules } from './modules'
import { dotEnvConfigProvider, makeTelemetryLayer, runMain } from './runtime'

const logger = useLogger('life:worker')

// The worker shares the auth module's config; require the secret from the
// environment (no hardcoded fallback) and fail fast if it's missing/weak.
if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32) {
  logger.error('AUTH_SECRET missing or shorter than 32 chars — refusing to start.')
  process.exit(1)
}
process.env.AUTH_APP ??= 'life'

const { runtimeLayer, startup, started, teardown, modules: built } = buildRuntime({
  modules,
  services: Email.fromEnv,
})

const consumers = built.flatMap(m => m.queues ?? [])
logger.success(`life worker: ${consumers.length} consumer(s) — ${consumers.map(c => c.name).join(', ') || 'none'}`)

const program = Effect.gen(function* () {
  yield* startup
  yield* started
  yield* Effect.forEach(consumers, c => Effect.forkScoped(c.run), { discard: true })
  yield* Effect.addFinalizer(() => teardown.pipe(Effect.catchCause(() => Effect.void)))
  yield* Effect.never
}).pipe(
  Effect.scoped,
  Effect.provide(Layer.mergeAll(runtimeLayer, JobQueueLiveFromEnv)),
)

// Effect-native OTLP export for the worker — forked queue consumers inherit the
// program context, so their spans/metrics reach the collector. Off when
// OTEL_EXPORTER_OTLP_ENDPOINT is unset. Distinct service name from the server.
const telemetryLayer = makeTelemetryLayer('life-worker')
if (telemetryLayer)
  logger.info(`telemetry: OTLP export → ${process.env.OTEL_EXPORTER_OTLP_ENDPOINT}`)

runWorker(program as Effect.Effect<void, unknown, never>, {
  runMain,
  configProvider: dotEnvConfigProvider,
  runtimeLayer: telemetryLayer,
})
