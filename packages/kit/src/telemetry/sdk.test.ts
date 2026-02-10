import { describe, expect, it } from 'vitest'
import { createSdkTelemetry } from './sdk'

describe('createSdkTelemetry', () => {
  const config = {
    enabled: true,
    serviceName: 'test-service',
    serviceVersion: '1.0.0',
    endpoint: 'http://localhost:4318',
    protocol: 'http' as const,
    samplingRatio: 1.0,
    logBridge: false,
  }

  it('creates a real telemetry instance when SDK packages are available', async () => {
    const telemetry = await createSdkTelemetry(config)
    // SDK packages are installed as optional peerDeps
    expect(telemetry).not.toBeNull()
    expect(telemetry!.isActive).toBe(true)
    await telemetry!.shutdown()
  })

  it('tracer creates spans that can be used', async () => {
    const telemetry = await createSdkTelemetry(config)
    expect(telemetry).not.toBeNull()

    const tracer = telemetry!.tracer('test')

    // startActiveSpan with callback
    const result = tracer.startActiveSpan('test-op', (span) => {
      expect(span.traceId).toBeTruthy()
      expect(span.spanId).toBeTruthy()
      span.setAttribute('key', 'value')
      span.setAttributes({ num: 42, bool: true })
      span.setStatus('OK')
      span.end()
      return 'done'
    })
    expect(result).toBe('done')

    // startActiveSpan with options
    const result2 = tracer.startActiveSpan('test-op-2', { kind: 'CLIENT', attributes: { 'db.system': 'pg' } }, (span) => {
      span.setStatus('OK')
      span.end()
      return 42
    })
    expect(result2).toBe(42)

    // startSpan
    const span = tracer.startSpan('manual-span', { kind: 'PRODUCER' })
    expect(span.traceId).toHaveLength(32)
    expect(span.spanId).toHaveLength(16)
    span.recordException(new Error('test error'))
    span.setStatus('ERROR', 'test failure')
    span.end()

    await telemetry!.shutdown()
  })

  it('meter creates metric instruments', async () => {
    const telemetry = await createSdkTelemetry(config)
    expect(telemetry).not.toBeNull()

    const meter = telemetry!.meter('test')

    const counter = meter.createCounter('test.counter', { description: 'A test counter' })
    counter.add(1)
    counter.add(5, { label: 'foo' })

    const histogram = meter.createHistogram('test.histogram', { unit: 'ms' })
    histogram.record(42)
    histogram.record(100, { path: '/api' })

    const upDown = meter.createUpDownCounter('test.updown')
    upDown.add(1)
    upDown.add(-1, { pool: 'main' })

    await telemetry!.shutdown()
  })
})
