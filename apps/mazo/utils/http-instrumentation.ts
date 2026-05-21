/**
 * HTTP telemetry instrumentation for Nitro.
 *
 * Creates a middleware-style handler that:
 * 1. Extracts or generates a correlationId from `X-Correlation-Id` header
 * 2. Starts a SERVER span for the request lifecycle
 * 3. Propagates TelemetryContext via AsyncLocalStorage
 * 4. Records HTTP metrics (count, duration, active requests)
 */
import type { Counter, Histogram, Meter, Tracer, UpDownCounter } from '@opentelemetry/api'
import { runWithContext } from '@czo/kit/telemetry'
import { metrics, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api'

/* ─── HTTP Metrics ──────────────────────────── */

export interface HttpMetrics {
  /** Total HTTP requests received */
  requestCount: Counter
  /** HTTP request duration in milliseconds */
  requestDuration: Histogram
  /** Currently active HTTP requests */
  activeRequests: UpDownCounter
}

export function createHttpMetrics(meter?: Meter): HttpMetrics {
  const m = meter ?? metrics.getMeter('czo.http')
  return {
    requestCount: m.createCounter('http.server.request.count', {
      description: 'Total number of HTTP requests received',
      unit: '{request}',
    }),
    requestDuration: m.createHistogram('http.server.request.duration', {
      description: 'HTTP request duration',
      unit: 'ms',
    }),
    activeRequests: m.createUpDownCounter('http.server.active_requests', {
      description: 'Number of active HTTP requests',
      unit: '{request}',
    }),
  }
}

/* ─── Instrumentation Options ───────────────── */

export interface HttpInstrumentationOptions {
  tracer?: Tracer
  metrics?: HttpMetrics
  /** Header name for correlation ID (default: "x-correlation-id") */
  correlationIdHeader?: string
}

export interface IncomingRequest {
  url?: string
  method?: string
  headers: Record<string, string | string[] | undefined>
}

export interface OutgoingResponse {
  statusCode?: number
}

/**
 * Create an HTTP instrumentation handler.
 */
export function createHttpInstrumentation(options?: HttpInstrumentationOptions) {
  const tracer = options?.tracer ?? trace.getTracer('czo.http')
  const metricsBundle = options?.metrics ?? createHttpMetrics()
  const headerName = options?.correlationIdHeader ?? 'x-correlation-id'

  return async function instrumentRequest<T>(
    req: IncomingRequest,
    res: OutgoingResponse,
    handler: () => Promise<T>,
  ): Promise<T> {
    const method = req.method ?? 'UNKNOWN'
    const url = req.url ?? '/'
    const correlationId = extractHeader(req.headers, headerName) ?? crypto.randomUUID()

    metricsBundle.activeRequests.add(1, { 'http.method': method })
    const start = Date.now()

    return tracer.startActiveSpan(
      `${method} ${url}`,
      {
        kind: SpanKind.SERVER,
        attributes: {
          'http.method': method,
          'http.url': url,
          'http.correlation_id': correlationId,
        },
      },
      async (span) => {
        const { traceId, spanId } = span.spanContext()
        return runWithContext(
          { correlationId, traceId, parentSpanId: spanId },
          async () => {
            try {
              const result = await handler()
              const statusCode = res.statusCode ?? 200
              span.setAttribute('http.status_code', statusCode)
              span.setStatus({ code: statusCode < 400 ? SpanStatusCode.OK : SpanStatusCode.ERROR })
              metricsBundle.requestCount.add(1, { 'http.method': method, 'http.status_code': statusCode })
              return result
            }
            catch (error) {
              span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message })
              span.recordException(error as Error)
              metricsBundle.requestCount.add(1, { 'http.method': method, 'http.status_code': 500 })
              throw error
            }
            finally {
              metricsBundle.requestDuration.record(Date.now() - start, { 'http.method': method })
              metricsBundle.activeRequests.add(-1, { 'http.method': method })
              span.end()
            }
          },
        )
      },
    )
  }
}

function extractHeader(headers: Record<string, string | string[] | undefined>, name: string): string | undefined {
  const value = headers[name]
  return Array.isArray(value) ? value[0] : value
}
