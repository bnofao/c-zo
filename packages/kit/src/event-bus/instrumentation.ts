/**
 * EventBus telemetry instrumentation.
 *
 * Wraps an EventBus with distributed tracing spans and metrics.
 * Uses the decorator pattern — returns a new object that proxies
 * all calls through tracing, preserving the original immutably.
 */
import type { Counter, Histogram, Meter, Telemetry } from '@czo/kit/telemetry'
import type { DomainEvent, DomainEventHandler, EventBus, Unsubscribe } from './types'
import { useTelemetrySync } from '@czo/kit/telemetry'

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

/* ─── Instrumentation Options ───────────────── */

export interface InstrumentEventBusOptions {
  telemetry?: Telemetry
  metrics?: EventBusMetrics
}

/**
 * Wrap an EventBus with telemetry instrumentation.
 * Returns a new EventBus that adds PRODUCER spans on publish
 * and CONSUMER spans on handler invocations.
 */
export function instrumentEventBus(bus: EventBus, options?: InstrumentEventBusOptions): EventBus {
  const telemetry = options?.telemetry ?? useTelemetrySync()
  const tracer = telemetry.tracer('czo.event-bus')
  const metrics = options?.metrics ?? createEventBusMetrics()

  return {
    async publish(event: DomainEvent): Promise<unknown> {
      const start = Date.now()

      return tracer.startActiveSpan(
        `event_bus.publish ${event.type}`,
        { kind: 'PRODUCER', attributes: { 'messaging.event.type': event.type, 'messaging.event.id': event.id } },
        async (span) => {
          try {
            const result = await bus.publish(event)
            span.setStatus('OK')
            metrics.publishCount.add(1, { 'event.type': event.type })
            return result
          }
          catch (error) {
            span.setStatus('ERROR', (error as Error).message)
            span.recordException(error as Error)
            metrics.publishErrors.add(1, { 'event.type': event.type })
            throw error
          }
          finally {
            metrics.publishDuration.record(Date.now() - start, { 'event.type': event.type })
            span.end()
          }
        },
      )
    },

    subscribe(pattern: string, handler: DomainEventHandler): Unsubscribe {
      const wrappedHandler: DomainEventHandler = async (event) => {
        const start = Date.now()

        return tracer.startActiveSpan(
          `event_bus.consume ${event.type}`,
          { kind: 'CONSUMER', attributes: { 'messaging.event.type': event.type, 'messaging.event.id': event.id } },
          async (span) => {
            try {
              await handler(event)
              span.setStatus('OK')
              metrics.consumeCount.add(1, { 'event.type': event.type })
            }
            catch (error) {
              span.setStatus('ERROR', (error as Error).message)
              span.recordException(error as Error)
              metrics.handleErrors.add(1, { 'event.type': event.type })
              throw error
            }
            finally {
              metrics.handleDuration.record(Date.now() - start, { 'event.type': event.type })
              span.end()
            }
          },
        )
      }

      return bus.subscribe(pattern, wrappedHandler)
    },

    shutdown(): Promise<void> {
      return bus.shutdown()
    },
  }
}
