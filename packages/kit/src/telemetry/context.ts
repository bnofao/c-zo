/**
 * Request-scoped context propagation via AsyncLocalStorage.
 *
 * Bridges OpenTelemetry trace context with the czo correlationId system.
 * Each incoming request (HTTP, event handler) gets its own context
 * containing the correlationId and traceId for the current operation.
 */
import { AsyncLocalStorage } from 'node:async_hooks'

export interface TelemetryContext {
  /** Correlation ID for distributed tracing (propagated across services) */
  correlationId: string
  /** OpenTelemetry trace ID (hex string, 32 chars) */
  traceId?: string
  /** OpenTelemetry span ID of the parent span (hex string, 16 chars) */
  parentSpanId?: string
}

const storage = new AsyncLocalStorage<TelemetryContext>()

/**
 * Run a function within a telemetry context.
 * The context is available to all async operations inside the callback.
 */
export function runWithContext<T>(ctx: TelemetryContext, fn: () => T): T {
  return storage.run(ctx, fn)
}

/**
 * Get the current telemetry context, or undefined if outside a context.
 */
export function getContext(): TelemetryContext | undefined {
  return storage.getStore()
}

/**
 * Get the current correlation ID, or undefined if outside a context.
 */
export function getCorrelationId(): string | undefined {
  return storage.getStore()?.correlationId
}

/**
 * Get the current trace ID, or undefined if not set.
 */
export function getTraceId(): string | undefined {
  return storage.getStore()?.traceId
}
