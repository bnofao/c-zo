import { describe, expect, it } from 'vitest'
import { createDbMetrics, createEventBusMetrics, createHttpMetrics } from './metrics'
import { NoopMeter } from './noop'

describe('createHttpMetrics', () => {
  it('creates all HTTP metric instruments', () => {
    const meter = new NoopMeter()
    const metrics = createHttpMetrics(meter)

    expect(metrics.requestCount).toBeDefined()
    expect(metrics.requestDuration).toBeDefined()
    expect(metrics.activeRequests).toBeDefined()
  })

  it('instruments are callable', () => {
    const meter = new NoopMeter()
    const metrics = createHttpMetrics(meter)

    metrics.requestCount.add(1, { 'http.method': 'GET' })
    metrics.requestDuration.record(42, { 'http.method': 'POST' })
    metrics.activeRequests.add(1)
    metrics.activeRequests.add(-1)
  })
})

describe('createEventBusMetrics', () => {
  it('creates all EventBus metric instruments', () => {
    const meter = new NoopMeter()
    const metrics = createEventBusMetrics(meter)

    expect(metrics.publishCount).toBeDefined()
    expect(metrics.consumeCount).toBeDefined()
    expect(metrics.publishDuration).toBeDefined()
    expect(metrics.handleDuration).toBeDefined()
    expect(metrics.publishErrors).toBeDefined()
    expect(metrics.handleErrors).toBeDefined()
  })
})

describe('createDbMetrics', () => {
  it('creates all DB metric instruments', () => {
    const meter = new NoopMeter()
    const metrics = createDbMetrics(meter)

    expect(metrics.queryCount).toBeDefined()
    expect(metrics.queryDuration).toBeDefined()
    expect(metrics.queryErrors).toBeDefined()
  })
})
