/**
 * HTTP telemetry instrumentation for Nitro.
 *
 * Creates a middleware-style handler that:
 * 1. Extracts or generates a correlationId from `X-Correlation-Id` header
 * 2. Starts a SERVER span for the request lifecycle
 * 3. Propagates TelemetryContext via AsyncLocalStorage
 * 4. Records HTTP metrics (count, duration, active requests)
 */
import type { HttpMetrics } from '../metrics'
import type { Telemetry } from '../types'
import { runWithContext } from '../context'
import { createHttpMetrics } from '../metrics'
import { useTelemetrySync } from '../use-telemetry'

export interface HttpInstrumentationOptions {
  telemetry?: Telemetry
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
 *
 * In Nitro, this can be used as a server middleware:
 * ```ts
 * const instrument = createHttpInstrumentation()
 * export default defineEventHandler(async (event) => {
 *   return instrument(event.node.req, event.node.res, async () => {
 *     // handler logic runs inside TelemetryContext
 *   })
 * })
 * ```
 */
export function createHttpInstrumentation(options?: HttpInstrumentationOptions) {
  const telemetry = options?.telemetry ?? useTelemetrySync()
  const tracer = telemetry.tracer('czo.http')
  const metrics = options?.metrics ?? createHttpMetrics()
  const headerName = options?.correlationIdHeader ?? 'x-correlation-id'

  return async function instrumentRequest<T>(
    req: IncomingRequest,
    res: OutgoingResponse,
    handler: () => Promise<T>,
  ): Promise<T> {
    const method = req.method ?? 'UNKNOWN'
    const url = req.url ?? '/'
    const correlationId = extractHeader(req.headers, headerName) ?? crypto.randomUUID()

    metrics.activeRequests.add(1, { 'http.method': method })
    const start = Date.now()

    return tracer.startActiveSpan(
      `${method} ${url}`,
      {
        kind: 'SERVER',
        attributes: {
          'http.method': method,
          'http.url': url,
          'http.correlation_id': correlationId,
        },
      },
      async (span) => {
        return runWithContext(
          { correlationId, traceId: span.traceId, parentSpanId: span.spanId },
          async () => {
            try {
              const result = await handler()
              const statusCode = res.statusCode ?? 200
              span.setAttribute('http.status_code', statusCode)
              span.setStatus(statusCode < 400 ? 'OK' : 'ERROR')
              metrics.requestCount.add(1, { 'http.method': method, 'http.status_code': statusCode })
              return result
            }
            catch (error) {
              span.setStatus('ERROR', (error as Error).message)
              span.recordException(error as Error)
              metrics.requestCount.add(1, { 'http.method': method, 'http.status_code': 500 })
              throw error
            }
            finally {
              metrics.requestDuration.record(Date.now() - start, { 'http.method': method })
              metrics.activeRequests.add(-1, { 'http.method': method })
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
