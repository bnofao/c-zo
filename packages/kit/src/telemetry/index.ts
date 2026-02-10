/* ─── Context propagation ───────────────────── */
export type { TelemetryContext } from './context'

export {
  getContext,
  getCorrelationId,
  getTraceId,
  runWithContext,
} from './context'

/* ─── Instrumentations ─────────────────────── */
export { instrumentEventBus } from './instrumentations/event-bus'
export { createHttpInstrumentation } from './instrumentations/http'

export { createRepositoryInstrumentation } from './instrumentations/repository'

/* ─── Log bridge ────────────────────────────── */
export { createLogBridgeReporter } from './log-bridge'
/* ─── Predefined metrics ───────────────────── */
export type { DbMetrics, EventBusMetrics, HttpMetrics } from './metrics'

export { createDbMetrics, createEventBusMetrics, createHttpMetrics } from './metrics'

/* ─── No-op implementations ─────────────────── */
export {
  NoopCounter,
  NoopHistogram,
  NoopMeter,
  NoopSpan,
  NoopTelemetry,
  NoopTracer,
  NoopUpDownCounter,
} from './noop'
/* ─── Types ──────────────────────────────────── */
export type {
  Counter,
  Histogram,
  Meter,
  MetricOptions,
  Span,
  SpanKind,
  SpanOptions,
  SpanStatusCode,
  Telemetry,
  TelemetryConfig,
  Tracer,
  UpDownCounter,
} from './types'
/* ─── Singleton accessor ────────────────────── */
export {
  resetTelemetry,
  shutdownTelemetry,
  useTelemetry,
  useTelemetrySync,
} from './use-telemetry'
