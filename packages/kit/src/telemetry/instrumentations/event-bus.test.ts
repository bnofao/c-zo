import type { DomainEvent, EventBus } from '../../event-bus/types'
import type { EventBusMetrics } from '../metrics'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NoopTelemetry } from '../noop'
import { instrumentEventBus } from './event-bus'

function createMockBus(): EventBus {
  return {
    publish: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockReturnValue(() => {}),
    shutdown: vi.fn().mockResolvedValue(undefined),
  }
}

function createMockMetrics(): EventBusMetrics {
  return {
    publishCount: { add: vi.fn() },
    consumeCount: { add: vi.fn() },
    publishDuration: { record: vi.fn() },
    handleDuration: { record: vi.fn() },
    publishErrors: { add: vi.fn() },
    handleErrors: { add: vi.fn() },
  }
}

const testEvent: DomainEvent = {
  id: 'evt-1',
  type: 'product.created',
  timestamp: new Date().toISOString(),
  payload: { title: 'Test Product' },
  metadata: {
    source: 'test',
    version: 1,
    correlationId: 'corr-1',
  },
}

describe('instrumentEventBus', () => {
  let bus: EventBus
  let metrics: EventBusMetrics
  let instrumented: EventBus

  beforeEach(() => {
    bus = createMockBus()
    metrics = createMockMetrics()
    instrumented = instrumentEventBus(bus, {
      telemetry: new NoopTelemetry(),
      metrics,
    })
  })

  describe('publish', () => {
    it('delegates to the underlying bus', async () => {
      await instrumented.publish(testEvent)
      expect(bus.publish).toHaveBeenCalledWith(testEvent)
    })

    it('records publish count metric on success', async () => {
      await instrumented.publish(testEvent)
      expect(metrics.publishCount.add).toHaveBeenCalledWith(1, { 'event.type': 'product.created' })
    })

    it('records publish duration metric', async () => {
      await instrumented.publish(testEvent)
      expect(metrics.publishDuration.record).toHaveBeenCalledWith(
        expect.any(Number),
        { 'event.type': 'product.created' },
      )
    })

    it('records error metrics on publish failure', async () => {
      const error = new Error('connection lost')
      ;(bus.publish as ReturnType<typeof vi.fn>).mockRejectedValueOnce(error)

      await expect(instrumented.publish(testEvent)).rejects.toThrow('connection lost')
      expect(metrics.publishErrors.add).toHaveBeenCalledWith(1, { 'event.type': 'product.created' })
      expect(metrics.publishDuration.record).toHaveBeenCalled()
    })
  })

  describe('subscribe', () => {
    it('delegates subscribe to the underlying bus', () => {
      const handler = vi.fn()
      instrumented.subscribe('product.*', handler)
      expect(bus.subscribe).toHaveBeenCalledWith('product.*', expect.any(Function))
    })

    it('wraps handler with tracing and records consume metrics', async () => {
      const handler = vi.fn().mockResolvedValue(undefined)
      instrumented.subscribe('product.*', handler)

      // Extract the wrapped handler
      const wrappedHandler = (bus.subscribe as ReturnType<typeof vi.fn>).mock.calls[0][1]
      await wrappedHandler(testEvent)

      expect(handler).toHaveBeenCalledWith(testEvent)
      expect(metrics.consumeCount.add).toHaveBeenCalledWith(1, { 'event.type': 'product.created' })
      expect(metrics.handleDuration.record).toHaveBeenCalledWith(
        expect.any(Number),
        { 'event.type': 'product.created' },
      )
    })

    it('records handle error metrics on handler failure', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('handler crash'))
      instrumented.subscribe('product.*', handler)

      const wrappedHandler = (bus.subscribe as ReturnType<typeof vi.fn>).mock.calls[0][1]
      await expect(wrappedHandler(testEvent)).rejects.toThrow('handler crash')

      expect(metrics.handleErrors.add).toHaveBeenCalledWith(1, { 'event.type': 'product.created' })
      expect(metrics.handleDuration.record).toHaveBeenCalled()
    })
  })

  describe('shutdown', () => {
    it('delegates to the underlying bus', async () => {
      await instrumented.shutdown()
      expect(bus.shutdown).toHaveBeenCalled()
    })
  })
})
