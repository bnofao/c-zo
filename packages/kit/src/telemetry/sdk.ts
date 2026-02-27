/**
 * Real OpenTelemetry SDK initialization.
 *
 * Dynamically imports @opentelemetry packages (optional peerDeps).
 * If any SDK package is missing, returns null so the caller can
 * fall back to NoopTelemetry.
 */
import type { Counter, Histogram, Meter, MetricOptions, Span, SpanKind, SpanOptions, SpanStatusCode, Telemetry, TelemetryConfig, Tracer, UpDownCounter } from './types'

/* ─── OTel type imports (type-only, safe even without packages) ── */

type OtelSpan = import('@opentelemetry/api').Span
type OtelTracer = import('@opentelemetry/api').Tracer
type OtelMeter = import('@opentelemetry/api').Meter
type OtelApi = typeof import('@opentelemetry/api')

/* ─── SpanKind / StatusCode mapping ─────────── */

const SPAN_KIND_MAP: Record<SpanKind, number> = {
  INTERNAL: 0,
  SERVER: 1,
  CLIENT: 2,
  PRODUCER: 3,
  CONSUMER: 4,
}

const STATUS_CODE_MAP: Record<SpanStatusCode, number> = {
  UNSET: 0,
  OK: 1,
  ERROR: 2,
}

/* ─── Adapters wrapping OTel primitives ─────── */

class OtelSpanAdapter implements Span {
  readonly #inner: OtelSpan

  constructor(inner: OtelSpan) {
    this.#inner = inner
  }

  get traceId(): string {
    return this.#inner.spanContext().traceId
  }

  get spanId(): string {
    return this.#inner.spanContext().spanId
  }

  setAttribute(key: string, value: string | number | boolean): void {
    this.#inner.setAttribute(key, value)
  }

  setAttributes(attributes: Record<string, string | number | boolean>): void {
    this.#inner.setAttributes(attributes)
  }

  recordException(error: Error): void {
    this.#inner.recordException(error)
  }

  setStatus(code: SpanStatusCode, message?: string): void {
    this.#inner.setStatus({ code: STATUS_CODE_MAP[code], message })
  }

  end(): void {
    this.#inner.end()
  }
}

class OtelTracerAdapter implements Tracer {
  readonly #inner: OtelTracer

  constructor(inner: OtelTracer) {
    this.#inner = inner
  }

  startActiveSpan<T>(name: string, fnOrOptions: SpanOptions | ((span: Span) => T), fn?: (span: Span) => T): T {
    if (typeof fnOrOptions === 'function') {
      return this.#inner.startActiveSpan(name, (otelSpan) => {
        return fnOrOptions(new OtelSpanAdapter(otelSpan))
      })
    }
    const otelOptions = {
      kind: SPAN_KIND_MAP[fnOrOptions.kind ?? 'INTERNAL'],
      attributes: fnOrOptions.attributes,
    }
    return this.#inner.startActiveSpan(name, otelOptions, (otelSpan) => {
      return fn!(new OtelSpanAdapter(otelSpan))
    })
  }

  startSpan(name: string, options?: SpanOptions): Span {
    const otelOptions = options
      ? { kind: SPAN_KIND_MAP[options.kind ?? 'INTERNAL'], attributes: options.attributes }
      : undefined
    return new OtelSpanAdapter(this.#inner.startSpan(name, otelOptions))
  }
}

class OtelCounterAdapter implements Counter {
  readonly #inner: import('@opentelemetry/api').Counter

  constructor(inner: import('@opentelemetry/api').Counter) {
    this.#inner = inner
  }

  add(value: number = 1, attributes?: Record<string, string | number | boolean>): void {
    this.#inner.add(value, attributes)
  }
}

class OtelHistogramAdapter implements Histogram {
  readonly #inner: import('@opentelemetry/api').Histogram

  constructor(inner: import('@opentelemetry/api').Histogram) {
    this.#inner = inner
  }

  record(value: number, attributes?: Record<string, string | number | boolean>): void {
    this.#inner.record(value, attributes)
  }
}

class OtelUpDownCounterAdapter implements UpDownCounter {
  readonly #inner: import('@opentelemetry/api').UpDownCounter

  constructor(inner: import('@opentelemetry/api').UpDownCounter) {
    this.#inner = inner
  }

  add(value: number, attributes?: Record<string, string | number | boolean>): void {
    this.#inner.add(value, attributes)
  }
}

class OtelMeterAdapter implements Meter {
  readonly #inner: OtelMeter

  constructor(inner: OtelMeter) {
    this.#inner = inner
  }

  createCounter(name: string, options?: MetricOptions): Counter {
    return new OtelCounterAdapter(this.#inner.createCounter(name, options))
  }

  createHistogram(name: string, options?: MetricOptions): Histogram {
    return new OtelHistogramAdapter(this.#inner.createHistogram(name, options))
  }

  createUpDownCounter(name: string, options?: MetricOptions): UpDownCounter {
    return new OtelUpDownCounterAdapter(this.#inner.createUpDownCounter(name, options))
  }
}

/* ─── SDK Telemetry ─────────────────────────── */

interface SdkProviders {
  tracerProvider: { shutdown: () => Promise<void> }
  meterProvider: { shutdown: () => Promise<void> }
}

class SdkTelemetry implements Telemetry {
  readonly isActive = true
  readonly #api: OtelApi
  readonly #providers: SdkProviders

  constructor(api: OtelApi, providers: SdkProviders) {
    this.#api = api
    this.#providers = providers
  }

  tracer(name: string): Tracer {
    return new OtelTracerAdapter(this.#api.trace.getTracer(name))
  }

  meter(name: string): Meter {
    return new OtelMeterAdapter(this.#api.metrics.getMeter(name))
  }

  async shutdown(): Promise<void> {
    await Promise.all([
      this.#providers.tracerProvider.shutdown(),
      this.#providers.meterProvider.shutdown(),
    ])
  }
}

/* ─── SDK initialization ────────────────────── */

/**
 * Attempt to initialize the real OpenTelemetry SDK.
 * Returns null if any required package is not installed.
 */
export async function createSdkTelemetry(config: TelemetryConfig): Promise<Telemetry | null> {
  try {
    const [api, sdkTraceNode, sdkMetrics, otlpTraceHttp, otlpMetricsHttp, resources, semanticConventions] = await Promise.all([
      import('@opentelemetry/api'),
      import('@opentelemetry/sdk-trace-node'),
      import('@opentelemetry/sdk-metrics'),
      import('@opentelemetry/exporter-trace-otlp-http'),
      import('@opentelemetry/exporter-metrics-otlp-http'),
      import('@opentelemetry/resources'),
      import('@opentelemetry/semantic-conventions'),
    ])

    const resource = new resources.Resource({
      [semanticConventions.ATTR_SERVICE_NAME]: config.serviceName,
      [semanticConventions.ATTR_SERVICE_VERSION]: config.serviceVersion,
    })

    // Trace provider
    const traceExporter = new otlpTraceHttp.OTLPTraceExporter({
      url: `${config.endpoint}/v1/traces`,
    })

    const tracerProvider = new sdkTraceNode.NodeTracerProvider({
      resource,
      spanProcessors: [new sdkTraceNode.BatchSpanProcessor(traceExporter)],
      sampler: new sdkTraceNode.TraceIdRatioBasedSampler(config.samplingRatio),
    })

    tracerProvider.register()

    // Metrics provider
    const metricsExporter = new otlpMetricsHttp.OTLPMetricExporter({
      url: `${config.endpoint}/v1/metrics`,
    })

    const meterProvider = new sdkMetrics.MeterProvider({
      resource,
      readers: [
        new sdkMetrics.PeriodicExportingMetricReader({
          exporter: metricsExporter,
          exportIntervalMillis: 30_000,
        }),
      ],
    })

    api.metrics.setGlobalMeterProvider(meterProvider)

    // Log bridge: forward consola logs to OTel LoggerProvider
    if (config.logBridge) {
      const { createLogBridgeReporter } = await import('./log-bridge')
      const reporter = await createLogBridgeReporter()
      if (reporter) {
        const { consola } = await import('consola')
        consola.addReporter(reporter)
      }
    }

    return new SdkTelemetry(api, {
      tracerProvider,
      meterProvider,
    })
  }
  catch {
    // SDK packages not installed — caller will use NoopTelemetry
    return null
  }
}
