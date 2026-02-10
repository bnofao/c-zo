/**
 * No-op telemetry implementations.
 *
 * Used as a safe fallback when the OpenTelemetry SDK is not installed.
 * All methods are functional but silently discard data, so modules
 * can instrument code unconditionally with zero overhead.
 */
import type { Counter, Histogram, Meter, MetricOptions, Span, SpanOptions, Telemetry, Tracer, UpDownCounter } from './types'

/* ─── Span ──────────────────────────────────── */

export class NoopSpan implements Span {
  readonly traceId = '00000000000000000000000000000000'
  readonly spanId = '0000000000000000'

  setAttribute(_key: string, _value: string | number | boolean): void {}
  setAttributes(_attributes: Record<string, string | number | boolean>): void {}
  recordException(_error: Error): void {}
  setStatus(_code: 'UNSET' | 'OK' | 'ERROR', _message?: string): void {}
  end(): void {}
}

/* ─── Metrics ───────────────────────────────── */

export class NoopCounter implements Counter {
  add(_value?: number, _attributes?: Record<string, string | number | boolean>): void {}
}

export class NoopHistogram implements Histogram {
  record(_value: number, _attributes?: Record<string, string | number | boolean>): void {}
}

export class NoopUpDownCounter implements UpDownCounter {
  add(_value: number, _attributes?: Record<string, string | number | boolean>): void {}
}

/* ─── Meter ──────────────────────────────────── */

export class NoopMeter implements Meter {
  createCounter(_name: string, _options?: MetricOptions): Counter {
    return new NoopCounter()
  }

  createHistogram(_name: string, _options?: MetricOptions): Histogram {
    return new NoopHistogram()
  }

  createUpDownCounter(_name: string, _options?: MetricOptions): UpDownCounter {
    return new NoopUpDownCounter()
  }
}

/* ─── Tracer ────────────────────────────────── */

export class NoopTracer implements Tracer {
  startActiveSpan<T>(_name: string, fnOrOptions: SpanOptions | ((span: Span) => T), fn?: (span: Span) => T): T {
    const callback = typeof fnOrOptions === 'function' ? fnOrOptions : fn!
    return callback(new NoopSpan())
  }

  startSpan(_name: string, _options?: SpanOptions): Span {
    return new NoopSpan()
  }
}

/* ─── Telemetry ─────────────────────────────── */

export class NoopTelemetry implements Telemetry {
  readonly isActive = false

  tracer(_name: string): Tracer {
    return new NoopTracer()
  }

  meter(_name: string): Meter {
    return new NoopMeter()
  }

  async shutdown(): Promise<void> {}
}
