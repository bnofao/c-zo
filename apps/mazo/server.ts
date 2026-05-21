/**
 * Nitro server entry — bootstrap for the mazo app.
 *
 * Two responsibilities at module load (runs once per worker):
 *
 * 1. **OpenTelemetry SDK bootstrap.** The module top-level runs ONCE
 *    when Nitro first imports it in the worker bundle, so this is the
 *    earliest hook where we can register auto-instrumentations BEFORE
 *    `pg`/`node:http` are imported by other modules.
 *
 * 2. **Application composition.** Call `composeApp(modules)` to:
 *    - Aggregate every module's DB schema + relations + seeders.
 *    - Apply every module's GraphQL Pothos contribution.
 *    - Merge every module's Effect Layer into one `appLayer`.
 *    - Build the single app-wide `ManagedRuntime` from `appLayer`.
 *    - Run every module's `onStart` effect against the runtime.
 *
 * The default export is a request handler that returns `undefined`,
 * letting Nitro fall through to normal route matching. We're using the
 * entry slot purely for its module-load timing.
 *
 * Phase 3 will drop the Nitro layer entirely — this file becomes a
 * `main.ts` invoked directly via `node main.ts` with `@effect/platform-node`
 * owning the HTTP server.
 */
import { trace } from '@opentelemetry/api'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http'
import { ConsoleMetricExporter, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { ConsoleSpanExporter, TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-base'
import { useLogger } from '@czo/kit'
import { buildEffectRuntime, clearEffectLayers, registerEffectLayer, runEffect } from '@czo/kit/effect'
import { composeApp } from '@czo/kit/module'
// @ts-expect-error — internal subpath, see server.ts in apps/mazo for context
import { tracer as drizzleTracer } from 'drizzle-orm/tracing'
import { defineHandler } from 'nitro'
import { useRuntimeConfig } from 'nitro/runtime-config'
import { makeModules } from './modules'

const logger = useLogger('mazo:bootstrap')

// ─── 1. OTel bootstrap (top-level side-effect) ───────────────────────────────

const otelEnabled = process.env.OTEL_ENABLED !== 'false'

if (otelEnabled) {
  const exporterMode = (process.env.OTEL_EXPORTER ?? 'console') as 'console' | 'otlp'
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318'
  const samplingRatio = Number(
    process.env.OTEL_SAMPLING_RATIO ?? (process.env.NODE_ENV === 'production' ? '0.1' : '1.0'),
  )

  const sdk = new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME ?? 'czo-mazo',
    sampler: new TraceIdRatioBasedSampler(samplingRatio),
    traceExporter: exporterMode === 'console'
      ? new ConsoleSpanExporter()
      : new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: exporterMode === 'console'
        ? new ConsoleMetricExporter()
        : new OTLPMetricExporter({ url: `${endpoint}/v1/metrics` }),
      exportIntervalMillis: 30_000,
    }),
    instrumentations: [new HttpInstrumentation()],
  })

  sdk.start()
  // eslint-disable-next-line no-console
  console.info(`[otel] SDK started (exporter=${exporterMode}, sampling=${samplingRatio})`)

  // Bridge drizzle-orm's noop tracer to the OTel global tracer so every
  // SQL query becomes a span (drizzle calls `startActiveSpan('drizzle.execute',
  // ...)` natively).
  const otelDrizzle = trace.getTracer('drizzle-orm')
  drizzleTracer.startActiveSpan = ((name: string, fn: (span: unknown) => unknown) =>
    otelDrizzle.startActiveSpan(name, (span) => {
      try {
        const result = fn(span)
        if (result instanceof Promise)
          return result.finally(() => span.end())
        span.end()
        return result
      }
      catch (err) {
        span.end()
        throw err
      }
    })) as typeof drizzleTracer.startActiveSpan

  const shutdown = () => sdk.shutdown().catch(() => undefined).finally(() => process.exit(0))
  process.once('SIGTERM', shutdown)
  process.once('SIGINT', shutdown)
}

// ─── 2. Application composition ──────────────────────────────────────────────

const runtimeConfig = useRuntimeConfig() as {
  app: string
  baseUrl?: string
  auth: { secret: string, socials?: never }
}

// Hot-reload safety: clear stale layer registrations from the previous
// boot before assembling the new set.
clearEffectLayers()

const composed = composeApp(makeModules({
  app: runtimeConfig.app,
  baseUrl: runtimeConfig.baseUrl,
  auth: { secret: runtimeConfig.auth.secret },
}))

// Push the composed module layer into the kit's layer registry. The kit
// owns the `ManagedRuntime` construction so request-time consumers
// (`useRuntime()` from any handler) get the same instance.
registerEffectLayer(composed.moduleLayer)

// Build the runtime now and run each module's `onStart` against it.
// We can't top-level-await here without Nitro support, so we kick off
// the startup asynchronously and log any failure. Request handlers will
// see the runtime once construction completes.
const runtime = buildEffectRuntime(/* infra is provided via NodeSdkLive in kit's plugin — TODO inline here once kit plugin is removed */ undefined as never)

if (runtime) {
  runEffect(runtime, composed.startup).then(
    () => logger.success(`mazo booted (${composed.modules.length} modules: ${composed.modules.map(m => m.name).join(', ')})`),
    err => logger.error('mazo startup failed', err),
  )
}

// ─── 3. Pass-through handler (Nitro entry contract) ──────────────────────────

export default defineHandler(() => {
  // Returning undefined hands the request back to Nitro's route matching.
  return undefined
})
