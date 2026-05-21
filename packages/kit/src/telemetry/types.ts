/**
 * Telemetry configuration shape.
 *
 * The OTel SDK is provided by `@effect/opentelemetry` via `makeNodeSdkLayer`
 * (composed into the kit's Effect runtime at boot). This file no longer
 * declares a provider-agnostic facade — instrumentation code uses
 * `@opentelemetry/api` directly or `Effect.fn` / `Effect.withSpan` on the
 * Effect side.
 */

export interface TelemetryConfig {
  /** Whether telemetry collection is enabled (default: true) */
  enabled: boolean
  /** Service name reported to collectors (default: "czo") */
  serviceName: string
  /** Service version (default: package.json version) */
  serviceVersion: string
  /**
   * Where to send spans and metrics.
   * - `'console'`: dump to stdout via `ConsoleSpanExporter` / `ConsoleMetricExporter`.
   *   Useful for local development — no collector required.
   * - `'otlp'` (default): send to an OTLP endpoint configured via `endpoint`.
   */
  exporter?: 'otlp' | 'console'
  /** OTLP endpoint for traces and metrics (default: "http://localhost:4318"). Ignored when `exporter === 'console'`. */
  endpoint: string
  /** Export protocol: "grpc" | "http" (default: "http") */
  protocol: 'grpc' | 'http'
  /** Sampling ratio 0..1 (default: 1.0 in dev, 0.1 in prod) */
  samplingRatio: number
  /** Whether to enable the log bridge (default: false) */
  logBridge: boolean
  /**
   * Auto-instrumentation toggles. When `true`, the matching
   * `@opentelemetry/instrumentation-*` package is registered at boot — DB and
   * HTTP-client calls get traced without manual span code. If the package is
   * not installed, the toggle is silently ignored.
   */
  instrumentations?: {
    /** `@opentelemetry/instrumentation-http` — fetch / outgoing HTTP. */
    http?: boolean
    /** `@opentelemetry/instrumentation-pg` — Postgres via `pg`. */
    pg?: boolean
  }
}
