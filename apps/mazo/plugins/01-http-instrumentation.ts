import type { Span, Tracer } from '@opentelemetry/api'
import { useLogger } from '@czo/kit'
import { metrics as otelMetrics, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api'
import { definePlugin } from 'nitro'
import { createHttpMetrics } from '../utils/http-instrumentation'

// Nitro's hook signature exposes the narrower `HTTPEvent` interface, but every
// runtime instance is the concrete `H3Event` (which carries `url` and
// `context`). h3 isn't a direct dep here, so we describe the shape we need
// structurally rather than importing `H3Event`.
interface EventWithCtx {
  req: { method?: string, headers: { get: (name: string) => string | null } }
  url?: URL
  context: Record<string, unknown>
}

interface RequestState {
  span: Span
  start: number
  method: string
}

/**
 * Per-request HTTP instrumentation wired into Nitro's lifecycle hooks
 * (`request` / `response` / `error`). Adds a SERVER span named by method,
 * the `http.server.*` metrics from `createHttpMetrics`, and propagates
 * `x-correlation-id` back to the client.
 *
 * The kit's auto-instrumentation-http (when enabled) creates its own spans
 * at the Node `http` layer — these are children of this one when context
 * propagation is wired. Sampling is identical (set via TelemetryConfig).
 */
export default definePlugin((nitroApp) => {
  const logger = useLogger('http-instrumentation')
  let tracer: Tracer | null = null
  let metrics: ReturnType<typeof createHttpMetrics> | null = null

  // Resolved lazily so `@czo/kit`'s plugin (which wires the OTel SDK in
  // czo:init) has finished by the time the first request arrives.
  const setup = () => {
    if (tracer)
      return
    tracer = trace.getTracer('czo.http')
    metrics = createHttpMetrics(otelMetrics.getMeter('czo.http'))
  }

  nitroApp.hooks.hook('request', (rawEvent) => {
    setup()
    const event = rawEvent as unknown as EventWithCtx
    const method = event.req.method ?? 'UNKNOWN'
    const url = event.url?.pathname ?? '/'
    const headerVal = event.req.headers.get('x-correlation-id')
    const correlationId = headerVal ?? crypto.randomUUID()

    const span = tracer!.startSpan(`${method} ${url}`, {
      kind: SpanKind.SERVER,
      attributes: { 'http.method': method, 'http.url': url, 'http.correlation_id': correlationId },
    })

    metrics!.activeRequests.add(1, { 'http.method': method })

    event.context.telemetry = { span, start: Date.now(), method } satisfies RequestState
    event.context.correlationId = correlationId
  })

  nitroApp.hooks.hook('response', (res, rawEvent) => {
    const event = rawEvent as unknown as EventWithCtx
    const state = event.context.telemetry as RequestState | undefined
    if (!state)
      return
    const statusCode = res.status ?? 200
    state.span.setAttribute('http.status_code', statusCode)
    state.span.setStatus({ code: statusCode < 400 ? SpanStatusCode.OK : SpanStatusCode.ERROR })
    metrics!.requestCount.add(1, { 'http.method': state.method, 'http.status_code': statusCode })
    metrics!.requestDuration.record(Date.now() - state.start, { 'http.method': state.method })
    metrics!.activeRequests.add(-1, { 'http.method': state.method })

    // Echo correlation id back so clients can trace their own requests.
    const correlationId = event.context.correlationId as string | undefined
    if (correlationId)
      res.headers.set('x-correlation-id', correlationId)

    state.span.end()
  })

  nitroApp.hooks.hook('error', (error, ctx) => {
    const event = ctx?.event as unknown as EventWithCtx | undefined
    const state = event?.context.telemetry as RequestState | undefined
    if (!state)
      return
    state.span.recordException(error as Error)
    state.span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message })
  })

  logger.debug('HTTP instrumentation wired to request/response/error hooks')
})
