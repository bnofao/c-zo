/**
 * Predefined metric instruments for czo services.
 *
 * Provides factory functions that create standard metrics using the
 * current telemetry instance. These follow OpenTelemetry semantic
 * conventions for HTTP, messaging, and database metrics.
 */
import type { Counter, Histogram, Meter, UpDownCounter } from './types'
import { useTelemetrySync } from './use-telemetry'

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
  const m = meter ?? useTelemetrySync().meter('czo.http')
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

/* ─── EventBus Metrics ──────────────────────── */

export interface EventBusMetrics {
  /** Total events published */
  publishCount: Counter
  /** Total events consumed (handler invocations) */
  consumeCount: Counter
  /** Event publish duration in milliseconds */
  publishDuration: Histogram
  /** Event handler processing duration in milliseconds */
  handleDuration: Histogram
  /** Total publish errors */
  publishErrors: Counter
  /** Total handler errors */
  handleErrors: Counter
}

export function createEventBusMetrics(meter?: Meter): EventBusMetrics {
  const m = meter ?? useTelemetrySync().meter('czo.event-bus')
  return {
    publishCount: m.createCounter('event_bus.publish.count', {
      description: 'Total events published',
      unit: '{event}',
    }),
    consumeCount: m.createCounter('event_bus.consume.count', {
      description: 'Total events consumed',
      unit: '{event}',
    }),
    publishDuration: m.createHistogram('event_bus.publish.duration', {
      description: 'Event publish duration',
      unit: 'ms',
    }),
    handleDuration: m.createHistogram('event_bus.consume.duration', {
      description: 'Event handler processing duration',
      unit: 'ms',
    }),
    publishErrors: m.createCounter('event_bus.publish.errors', {
      description: 'Total event publish errors',
      unit: '{error}',
    }),
    handleErrors: m.createCounter('event_bus.consume.errors', {
      description: 'Total event handler errors',
      unit: '{error}',
    }),
  }
}

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
  const m = meter ?? useTelemetrySync().meter('czo.db')
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
