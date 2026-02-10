/**
 * Telemetry abstraction layer.
 *
 * Provides a thin, provider-agnostic API over OpenTelemetry concepts.
 * When the OTel SDK is not installed, a no-op implementation is used
 * so modules can instrument code unconditionally.
 */

/* ─── Configuration ─────────────────────────── */

export interface TelemetryConfig {
  /** Whether telemetry collection is enabled (default: true) */
  enabled: boolean
  /** Service name reported to collectors (default: "czo") */
  serviceName: string
  /** Service version (default: package.json version) */
  serviceVersion: string
  /** OTLP endpoint for traces and metrics (default: "http://localhost:4318") */
  endpoint: string
  /** Export protocol: "grpc" | "http" (default: "http") */
  protocol: 'grpc' | 'http'
  /** Sampling ratio 0..1 (default: 1.0 in dev, 0.1 in prod) */
  samplingRatio: number
  /** Whether to enable the log bridge (default: false) */
  logBridge: boolean
}

/* ─── Span ──────────────────────────────────── */

export type SpanKind = 'INTERNAL' | 'SERVER' | 'CLIENT' | 'PRODUCER' | 'CONSUMER'

export type SpanStatusCode = 'UNSET' | 'OK' | 'ERROR'

export interface SpanOptions {
  kind?: SpanKind
  attributes?: Record<string, string | number | boolean>
}

export interface Span {
  /** Set a key-value attribute on the span */
  setAttribute: (key: string, value: string | number | boolean) => void
  /** Set multiple attributes at once */
  setAttributes: (attributes: Record<string, string | number | boolean>) => void
  /** Record an exception on the span */
  recordException: (error: Error) => void
  /** Set the span status */
  setStatus: (code: SpanStatusCode, message?: string) => void
  /** End the span (records its duration) */
  end: () => void
  /** The trace ID for this span */
  readonly traceId: string
  /** The span ID */
  readonly spanId: string
}

/* ─── Tracer ────────────────────────────────── */

export interface Tracer {
  /** Start a new span and run a function within it */
  startActiveSpan: (<T>(name: string, fn: (span: Span) => T) => T) & (<T>(name: string, options: SpanOptions, fn: (span: Span) => T) => T)
  /** Start a span without making it active in context */
  startSpan: (name: string, options?: SpanOptions) => Span
}

/* ─── Metrics ───────────────────────────────── */

export interface Counter {
  /** Increment the counter by the given value (default: 1) */
  add: (value?: number, attributes?: Record<string, string | number | boolean>) => void
}

export interface Histogram {
  /** Record a value in the histogram */
  record: (value: number, attributes?: Record<string, string | number | boolean>) => void
}

export interface UpDownCounter {
  /** Increment or decrement the counter */
  add: (value: number, attributes?: Record<string, string | number | boolean>) => void
}

export interface Meter {
  /** Create a monotonic counter */
  createCounter: (name: string, options?: MetricOptions) => Counter
  /** Create a histogram for recording distributions */
  createHistogram: (name: string, options?: MetricOptions) => Histogram
  /** Create a counter that can go up or down */
  createUpDownCounter: (name: string, options?: MetricOptions) => UpDownCounter
}

export interface MetricOptions {
  description?: string
  unit?: string
}

/* ─── Telemetry (top-level facade) ──────────── */

export interface Telemetry {
  /** Get a named tracer for creating spans */
  tracer: (name: string) => Tracer
  /** Get a named meter for creating metrics */
  meter: (name: string) => Meter
  /** Gracefully shut down exporters and flush pending data */
  shutdown: () => Promise<void>
  /** Whether this is a real (non-noop) telemetry instance */
  readonly isActive: boolean
}
