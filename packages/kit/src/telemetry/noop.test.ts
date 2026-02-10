import { describe, expect, it } from 'vitest'
import { NoopCounter, NoopHistogram, NoopMeter, NoopSpan, NoopTelemetry, NoopTracer, NoopUpDownCounter } from './noop'

describe('noopSpan', () => {
  it('has zeroed trace and span IDs', () => {
    const span = new NoopSpan()
    expect(span.traceId).toBe('00000000000000000000000000000000')
    expect(span.spanId).toBe('0000000000000000')
  })

  it('accepts all operations without throwing', () => {
    const span = new NoopSpan()
    span.setAttribute('key', 'value')
    span.setAttributes({ a: 1, b: true })
    span.recordException(new Error('test'))
    span.setStatus('ERROR', 'something failed')
    span.end()
  })
})

describe('noopCounter', () => {
  it('accepts add without throwing', () => {
    const counter = new NoopCounter()
    counter.add()
    counter.add(5)
    counter.add(1, { method: 'GET' })
  })
})

describe('noopHistogram', () => {
  it('accepts record without throwing', () => {
    const histogram = new NoopHistogram()
    histogram.record(42)
    histogram.record(100, { status: 200 })
  })
})

describe('noopUpDownCounter', () => {
  it('accepts add with positive and negative values', () => {
    const counter = new NoopUpDownCounter()
    counter.add(1)
    counter.add(-1)
    counter.add(5, { pool: 'main' })
  })
})

describe('noopMeter', () => {
  it('creates noop metric instruments', () => {
    const meter = new NoopMeter()

    const counter = meter.createCounter('test.counter')
    expect(counter).toBeInstanceOf(NoopCounter)

    const histogram = meter.createHistogram('test.histogram', { unit: 'ms' })
    expect(histogram).toBeInstanceOf(NoopHistogram)

    const upDown = meter.createUpDownCounter('test.updown')
    expect(upDown).toBeInstanceOf(NoopUpDownCounter)
  })
})

describe('noopTracer', () => {
  it('passes a noop span to startActiveSpan callback', () => {
    const tracer = new NoopTracer()
    const result = tracer.startActiveSpan('test-span', (span) => {
      expect(span).toBeInstanceOf(NoopSpan)
      return 42
    })
    expect(result).toBe(42)
  })

  it('passes a noop span with options overload', () => {
    const tracer = new NoopTracer()
    const result = tracer.startActiveSpan('test-span', { kind: 'CLIENT' }, (span) => {
      expect(span).toBeInstanceOf(NoopSpan)
      return 'done'
    })
    expect(result).toBe('done')
  })

  it('returns a noop span from startSpan', () => {
    const tracer = new NoopTracer()
    const span = tracer.startSpan('test-span')
    expect(span).toBeInstanceOf(NoopSpan)
  })
})

describe('noopTelemetry', () => {
  it('reports isActive as false', () => {
    const telemetry = new NoopTelemetry()
    expect(telemetry.isActive).toBe(false)
  })

  it('returns noop tracer and meter', () => {
    const telemetry = new NoopTelemetry()
    expect(telemetry.tracer('test')).toBeInstanceOf(NoopTracer)
    expect(telemetry.meter('test')).toBeInstanceOf(NoopMeter)
  })

  it('resolves shutdown without error', async () => {
    const telemetry = new NoopTelemetry()
    await expect(telemetry.shutdown()).resolves.toBeUndefined()
  })
})
