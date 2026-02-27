/* ─── Context propagation ───────────────────── */
export type { TelemetryContext } from './context'

export {
  getContext,
  getCorrelationId,
  getTraceId,
  runWithContext,
} from './context'
/* ─── Log bridge ────────────────────────────── */
export { createLogBridgeReporter } from './log-bridge'

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
