/**
 * Repository telemetry instrumentation.
 *
 * Provides a `withSpan()` helper for tracing database operations.
 * Designed to replace commented Sentry span code in the Repository base class.
 */
import type { Counter, Histogram, Meter, Span, Tracer } from '@opentelemetry/api'
import { metrics, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api'

/* ─── Database Metrics ──────────────────────── */

export interface DbMetrics {
  /** Total database queries executed */
  queryCount: Counter
  /** Database query duration in milliseconds */
  queryDuration: Histogram
  /** Total database query errors */
  queryErrors: Counter
}

export function createDbMetrics(meter?: Meter): DbMetrics {
  const m = meter ?? metrics.getMeter('czo.db')
  return {
    queryCount: m.createCounter('db.client.operation.count', {
      description: 'Total database queries executed',
      unit: '{query}',
    }),
    queryDuration: m.createHistogram('db.client.operation.duration', {
      description: 'Database query duration',
      unit: 'ms',
    }),
    queryErrors: m.createCounter('db.client.operation.errors', {
      description: 'Total database query errors',
      unit: '{error}',
    }),
  }
}

/* ─── Instrumentation Options ───────────────── */

export interface RepositoryInstrumentationOptions {
  tracer?: Tracer
  metrics?: DbMetrics
  /** Name prefix for spans (e.g., "ProductRepository") */
  name: string
}

/**
 * Create a `withSpan` helper bound to a specific repository.
 *
 * Usage in Repository subclass:
 * ```ts
 * const { withSpan } = createRepositoryInstrumentation({ name: 'ProductRepository' })
 * const result = await withSpan('findById', async (span) => {
 *   span.setAttribute('db.query.id', id)
 *   return this.db.select().from(table).where(...)
 * })
 * ```
 */
export function createRepositoryInstrumentation(options: RepositoryInstrumentationOptions) {
  const tracer = options.tracer ?? trace.getTracer('czo.db')
  const metricsBundle = options.metrics ?? createDbMetrics()
  const prefix = options.name

  async function withSpan<T>(operation: string, fn: (span: Span) => Promise<T>): Promise<T> {
    const start = Date.now()

    return tracer.startActiveSpan(
      `${prefix}.${operation}`,
      {
        kind: SpanKind.CLIENT,
        attributes: {
          'db.system': 'postgresql',
          'db.operation.name': operation,
          'db.repository': prefix,
        },
      },
      async (span) => {
        try {
          const result = await fn(span)
          span.setStatus({ code: SpanStatusCode.OK })
          metricsBundle.queryCount.add(1, { 'db.operation': operation })
          return result
        }
        catch (error) {
          span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message })
          span.recordException(error as Error)
          metricsBundle.queryErrors.add(1, { 'db.operation': operation })
          throw error
        }
        finally {
          metricsBundle.queryDuration.record(Date.now() - start, { 'db.operation': operation })
          span.end()
        }
      },
    )
  }

  return { withSpan }
}
