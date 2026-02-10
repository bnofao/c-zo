/**
 * EventBus telemetry instrumentation.
 *
 * Wraps an EventBus with distributed tracing spans and metrics.
 * Uses the decorator pattern — returns a new object that proxies
 * all calls through tracing, preserving the original immutably.
 */
import type { DomainEvent, DomainEventHandler, EventBus, Unsubscribe } from '../../event-bus/types'
import type { EventBusMetrics } from '../metrics'
import type { Telemetry } from '../types'
import { createEventBusMetrics } from '../metrics'
import { useTelemetrySync } from '../use-telemetry'

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
    async publish(event: DomainEvent): Promise<void> {
      const start = Date.now()

      return tracer.startActiveSpan(
        `event_bus.publish ${event.type}`,
        { kind: 'PRODUCER', attributes: { 'messaging.event.type': event.type, 'messaging.event.id': event.id } },
        async (span) => {
          try {
            await bus.publish(event)
            span.setStatus('OK')
            metrics.publishCount.add(1, { 'event.type': event.type })
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
