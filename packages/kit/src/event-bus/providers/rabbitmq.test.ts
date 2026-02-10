import type { DomainEvent, EventBus, RabbitMQConfig } from '../types'
import { Buffer } from 'node:buffer'
import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDomainEvent } from '../domain-event'

const MOCK_UUID = '550e8400-e29b-41d4-a716-446655440000'
vi.stubGlobal('crypto', { randomUUID: () => MOCK_UUID })

// --- Logger mock ---
vi.mock('../../logger', () => ({
  useLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

// --- EventEmitter-based amqplib mocks ---
let mockChannel: ReturnType<typeof createMockChannel>
let mockConnection: ReturnType<typeof createMockConnection>
let consumeCallback: ((msg: any) => void) | null = null
const mockConsumerTag = 'ctag-1'
let consumerTagCounter = 0

function createMockChannel() {
  const emitter = new EventEmitter()
  return Object.assign(emitter, {
    assertExchange: vi.fn().mockResolvedValue(undefined),
    assertQueue: vi.fn().mockResolvedValue({ queue: 'q-1' }),
    bindQueue: vi.fn().mockResolvedValue(undefined),
    publish: vi.fn().mockImplementation((_ex: string, _rk: string, _buf: Buffer, _opts: unknown, cb?: (err: Error | null) => void) => {
      if (cb)
        cb(null)
      return true
    }),
    consume: vi.fn().mockImplementation((_queue: string, cb: (msg: any) => void) => {
      consumeCallback = cb
      consumerTagCounter++
      return Promise.resolve({ consumerTag: `${mockConsumerTag}-${consumerTagCounter}` })
    }),
    cancel: vi.fn().mockResolvedValue(undefined),
    ack: vi.fn(),
    nack: vi.fn(),
    prefetch: vi.fn(),
    deleteQueue: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    waitForConfirms: vi.fn().mockResolvedValue(undefined),
  })
}

function createMockConnection(ch: ReturnType<typeof createMockChannel>) {
  const emitter = new EventEmitter()
  return Object.assign(emitter, {
    createConfirmChannel: vi.fn().mockResolvedValue(ch),
    close: vi.fn().mockResolvedValue(undefined),
  })
}

vi.mock('amqplib', () => ({
  default: {
    connect: vi.fn(),
  },
}))

function makeEvent(type: string, payload: unknown = {}): DomainEvent {
  return createDomainEvent({ type, payload })
}

const defaultConfig: RabbitMQConfig = {
  url: 'amqp://guest:guest@localhost:5672',
  exchange: 'czo.events',
  deadLetterExchange: 'czo.dlx',
  prefetch: 10,
  publisherConfirms: true,
}

describe('createRabbitMQEventBus', () => {
  let createRabbitMQEventBus: typeof import('./rabbitmq').createRabbitMQEventBus
  let bus: EventBus
  let amqplibMod: typeof import('amqplib')

  beforeEach(async () => {
    vi.clearAllMocks()
    consumeCallback = null
    consumerTagCounter = 0

    mockChannel = createMockChannel()
    mockConnection = createMockConnection(mockChannel)

    amqplibMod = await import('amqplib')
    vi.mocked(amqplibMod.default.connect).mockResolvedValue(mockConnection as any)

    const mod = await import('./rabbitmq')
    createRabbitMQEventBus = mod.createRabbitMQEventBus
    bus = await createRabbitMQEventBus(defaultConfig)
  })

  afterEach(async () => {
    await bus.shutdown()
  })

  describe('connection setup', () => {
    it('should connect to RabbitMQ', () => {
      expect(amqplibMod.default.connect).toHaveBeenCalledWith(defaultConfig.url)
    })

    it('should create a confirm channel', () => {
      expect(mockConnection.createConfirmChannel).toHaveBeenCalledOnce()
    })

    it('should assert the event exchange as topic type', () => {
      expect(mockChannel.assertExchange).toHaveBeenCalledWith(
        'czo.events',
        'topic',
        { durable: true },
      )
    })

    it('should assert the dead-letter exchange', () => {
      expect(mockChannel.assertExchange).toHaveBeenCalledWith(
        'czo.dlx',
        'topic',
        { durable: true },
      )
    })

    it('should assert the system fanout exchange', () => {
      expect(mockChannel.assertExchange).toHaveBeenCalledWith(
        'czo.system',
        'fanout',
        { durable: true },
      )
    })

    it('should set consumer prefetch', () => {
      expect(mockChannel.prefetch).toHaveBeenCalledWith(10)
    })
  })

  describe('publish', () => {
    it('should publish event to exchange with type as routing key', async () => {
      const event = makeEvent('product.created', { id: '1' })
      await bus.publish(event)

      expect(mockChannel.publish).toHaveBeenCalledWith(
        'czo.events',
        'product.created',
        expect.any(Buffer),
        expect.objectContaining({
          persistent: true,
          contentType: 'application/json',
          messageId: event.id,
          timestamp: expect.any(Number),
        }),
        expect.any(Function),
      )
    })

    it('should serialize the full domain event as JSON in the buffer', async () => {
      const event = makeEvent('order.placed', { orderId: 'abc' })
      await bus.publish(event)

      const bufferArg = mockChannel.publish.mock.calls[0][2]
      const parsed = JSON.parse(bufferArg.toString())
      expect(parsed.type).toBe('order.placed')
      expect(parsed.payload.orderId).toBe('abc')
    })
  })

  describe('subscribe', () => {
    it('should create a queue and bind it to the exchange with the pattern', async () => {
      bus.subscribe('product.*', vi.fn())

      await new Promise(resolve => setTimeout(resolve, 0))

      expect(mockChannel.assertQueue).toHaveBeenCalled()
      expect(mockChannel.bindQueue).toHaveBeenCalledWith(
        'q-1',
        'czo.events',
        'product.*',
      )
    })

    it('should invoke handler when a message is consumed', async () => {
      const handler = vi.fn()
      bus.subscribe('product.created', handler)

      await new Promise(resolve => setTimeout(resolve, 0))

      const event = makeEvent('product.created', { id: '1' })
      const msg = {
        content: Buffer.from(JSON.stringify(event)),
        fields: { routingKey: 'product.created' },
        properties: {},
      }

      consumeCallback!(msg)
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(handler).toHaveBeenCalledOnce()
      expect(handler.mock.calls[0][0].type).toBe('product.created')
    })

    it('should ack the message after successful handler execution', async () => {
      bus.subscribe('product.created', vi.fn())
      await new Promise(resolve => setTimeout(resolve, 0))

      const event = makeEvent('product.created')
      const msg = {
        content: Buffer.from(JSON.stringify(event)),
        fields: { routingKey: 'product.created' },
        properties: {},
      }

      consumeCallback!(msg)
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(mockChannel.ack).toHaveBeenCalledWith(msg)
    })

    it('should nack the message when handler throws', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('fail'))
      bus.subscribe('product.created', handler)
      await new Promise(resolve => setTimeout(resolve, 0))

      const event = makeEvent('product.created')
      const msg = {
        content: Buffer.from(JSON.stringify(event)),
        fields: { routingKey: 'product.created' },
        properties: {},
      }

      consumeCallback!(msg)
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(mockChannel.nack).toHaveBeenCalledWith(msg, false, false)
    })

    it('should return an unsubscribe function that cancels the consumer', async () => {
      const unsub = bus.subscribe('test.event', vi.fn())
      await new Promise(resolve => setTimeout(resolve, 0))

      unsub()
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(mockChannel.cancel).toHaveBeenCalled()
    })
  })

  describe('shutdown', () => {
    it('should close channel and connection', async () => {
      await bus.shutdown()

      expect(mockChannel.close).toHaveBeenCalledOnce()
      expect(mockConnection.close).toHaveBeenCalledOnce()
    })

    it('should be safe to call shutdown multiple times', async () => {
      await bus.shutdown()
      await expect(bus.shutdown()).resolves.toBeUndefined()
    })
  })

  describe('default config values', () => {
    it('should use defaults when optional config fields are omitted', async () => {
      vi.clearAllMocks()
      const freshChannel = createMockChannel()
      const freshConnection = createMockConnection(freshChannel)
      vi.mocked(amqplibMod.default.connect).mockResolvedValue(freshConnection as any)

      const minimalConfig: RabbitMQConfig = { url: 'amqp://localhost:5672' }
      const minimalBus = await createRabbitMQEventBus(minimalConfig)

      expect(freshChannel.assertExchange).toHaveBeenCalledWith(
        'czo.events',
        'topic',
        { durable: true },
      )
      expect(freshChannel.prefetch).toHaveBeenCalledWith(10)

      await minimalBus.shutdown()
    })
  })

  // ────────────────────────────────────────────────────────────
  // New tests: Event listeners
  // ────────────────────────────────────────────────────────────
  describe('event listeners', () => {
    it('should register listeners on connection and channel', () => {
      expect(mockConnection.listenerCount('error')).toBeGreaterThanOrEqual(1)
      expect(mockConnection.listenerCount('close')).toBeGreaterThanOrEqual(1)
      expect(mockChannel.listenerCount('error')).toBeGreaterThanOrEqual(1)
      expect(mockChannel.listenerCount('close')).toBeGreaterThanOrEqual(1)
      expect(mockChannel.listenerCount('return')).toBeGreaterThanOrEqual(1)
    })

    it('should not crash when connection emits error', () => {
      expect(() => {
        mockConnection.emit('error', new Error('connection lost'))
      }).not.toThrow()
    })

    it('should not crash when channel emits error', () => {
      expect(() => {
        mockChannel.emit('error', new Error('channel error'))
      }).not.toThrow()
    })

    it('should handle returned messages without crashing', () => {
      expect(() => {
        mockChannel.emit('return', { content: Buffer.from('test') })
      }).not.toThrow()
    })

    it('should not reconnect when reconnect is disabled', async () => {
      vi.useFakeTimers()
      vi.spyOn(Math, 'random').mockReturnValue(1)

      const disabledChannel = createMockChannel()
      const disabledConnection = createMockConnection(disabledChannel)
      vi.mocked(amqplibMod.default.connect).mockResolvedValue(disabledConnection as any)

      const disabledBus = await createRabbitMQEventBus({
        ...defaultConfig,
        reconnect: { enabled: false },
      })

      const connectCountBefore = vi.mocked(amqplibMod.default.connect).mock.calls.length
      disabledConnection.emit('close')

      await vi.advanceTimersByTimeAsync(5000)

      expect(vi.mocked(amqplibMod.default.connect).mock.calls.length).toBe(connectCountBefore)

      vi.useRealTimers()
      vi.restoreAllMocks()
      await disabledBus.shutdown()
    })

    it('should not reconnect after explicit shutdown', async () => {
      await bus.shutdown()

      // Emit close after shutdown — should not trigger reconnection
      mockConnection.emit('close')
      mockChannel.emit('close')

      // Give time for any reconnect to fire
      await new Promise(resolve => setTimeout(resolve, 50))

      // connect was called once (initial), should NOT be called again
      expect(amqplibMod.default.connect).toHaveBeenCalledTimes(1)
    })
  })

  // ────────────────────────────────────────────────────────────
  // New tests: Reconnection
  // ────────────────────────────────────────────────────────────
  describe('reconnection', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      // Pin jitter to max (factor=1.0) so delays are deterministic: delay = baseDelay
      vi.spyOn(Math, 'random').mockReturnValue(1)
    })

    afterEach(() => {
      vi.useRealTimers()
      vi.restoreAllMocks()
    })

    it('should reconnect when connection closes unexpectedly', async () => {
      const freshChannel = createMockChannel()
      const freshConnection = createMockConnection(freshChannel)
      vi.mocked(amqplibMod.default.connect).mockResolvedValue(freshConnection as any)

      // Simulate unexpected close
      mockConnection.emit('close')

      // Advance past initial delay (1000ms default)
      await vi.advanceTimersByTimeAsync(1000)

      // Should have called connect again
      expect(amqplibMod.default.connect).toHaveBeenCalledTimes(2)
    })

    it('should use exponential backoff with correct delays', async () => {
      // Make first attempt fail so it retries
      vi.mocked(amqplibMod.default.connect)
        .mockRejectedValueOnce(new Error('fail-1'))
        .mockRejectedValueOnce(new Error('fail-2'))
        .mockResolvedValueOnce(createMockConnection(createMockChannel()) as any)

      mockConnection.emit('close')

      // 1st attempt at 1000ms
      await vi.advanceTimersByTimeAsync(1000)
      expect(amqplibMod.default.connect).toHaveBeenCalledTimes(2)

      // 2nd attempt at 2000ms (1000 * 2^1)
      await vi.advanceTimersByTimeAsync(2000)
      expect(amqplibMod.default.connect).toHaveBeenCalledTimes(3)

      // 3rd attempt at 4000ms (1000 * 2^2)
      await vi.advanceTimersByTimeAsync(4000)
      expect(amqplibMod.default.connect).toHaveBeenCalledTimes(4)
    })

    it('should cap delay at maxDelayMs', async () => {
      // Create a dedicated connection for this bus so we can emit close on it
      const cappedChannel = createMockChannel()
      const cappedConnection = createMockConnection(cappedChannel)
      vi.mocked(amqplibMod.default.connect).mockResolvedValue(cappedConnection as any)

      const cappedBus = await createRabbitMQEventBus({
        ...defaultConfig,
        reconnect: { initialDelayMs: 1000, maxDelayMs: 3000, multiplier: 10 },
      })

      vi.mocked(amqplibMod.default.connect)
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce(createMockConnection(createMockChannel()) as any)

      cappedConnection.emit('close')

      // 1st attempt at 1000ms
      await vi.advanceTimersByTimeAsync(1000)

      // 2nd attempt should be capped at 3000ms (not 10000ms = 1000 * 10^1)
      await vi.advanceTimersByTimeAsync(3000)

      // Should have attempted reconnect at least twice after the close
      const connectCalls = vi.mocked(amqplibMod.default.connect).mock.calls.length
      expect(connectCalls).toBeGreaterThanOrEqual(4) // 2 initial + 2 reconnect attempts

      await cappedBus.shutdown()
    })

    it('should give up after maxAttempts', async () => {
      const limitedChannel = createMockChannel()
      const limitedConnection = createMockConnection(limitedChannel)
      vi.mocked(amqplibMod.default.connect).mockResolvedValue(limitedConnection as any)

      await createRabbitMQEventBus({
        ...defaultConfig,
        reconnect: { maxAttempts: 2, initialDelayMs: 100 },
      })

      // Set up failures for reconnection attempts
      vi.mocked(amqplibMod.default.connect)
        .mockRejectedValueOnce(new Error('fail-1'))
        .mockRejectedValueOnce(new Error('fail-2'))

      limitedConnection.emit('close')

      // Attempt 1 at 100ms
      await vi.advanceTimersByTimeAsync(100)
      // Attempt 2 at 200ms
      await vi.advanceTimersByTimeAsync(200)

      const connectCountAfterRetries = vi.mocked(amqplibMod.default.connect).mock.calls.length

      // Advance more — no more attempts should happen
      await vi.advanceTimersByTimeAsync(10_000)

      expect(vi.mocked(amqplibMod.default.connect).mock.calls.length).toBe(connectCountAfterRetries)

      // Don't call shutdown again — it's already in closed state
    })

    it('should re-assert exchanges and prefetch after reconnect', async () => {
      const freshChannel = createMockChannel()
      const freshConnection = createMockConnection(freshChannel)
      vi.mocked(amqplibMod.default.connect).mockResolvedValue(freshConnection as any)

      mockConnection.emit('close')
      await vi.advanceTimersByTimeAsync(1100)

      expect(freshChannel.assertExchange).toHaveBeenCalledWith('czo.events', 'topic', { durable: true })
      expect(freshChannel.assertExchange).toHaveBeenCalledWith('czo.dlx', 'topic', { durable: true })
      expect(freshChannel.assertExchange).toHaveBeenCalledWith('czo.system', 'fanout', { durable: true })
      expect(freshChannel.prefetch).toHaveBeenCalledWith(10)
    })

    it('should detach listeners from old connection/channel on reconnect', async () => {
      const freshChannel = createMockChannel()
      const freshConnection = createMockConnection(freshChannel)
      vi.mocked(amqplibMod.default.connect).mockResolvedValue(freshConnection as any)

      // Verify old objects have listeners before reconnect
      expect(mockConnection.listenerCount('close')).toBeGreaterThanOrEqual(1)
      expect(mockChannel.listenerCount('close')).toBeGreaterThanOrEqual(1)

      mockConnection.emit('close')
      await vi.advanceTimersByTimeAsync(1000)

      // Old objects should have listeners removed
      expect(mockConnection.listenerCount('error')).toBe(0)
      expect(mockConnection.listenerCount('close')).toBe(0)
      expect(mockChannel.listenerCount('error')).toBe(0)
      expect(mockChannel.listenerCount('close')).toBe(0)
      expect(mockChannel.listenerCount('return')).toBe(0)

      // New objects should have listeners attached
      expect(freshConnection.listenerCount('error')).toBeGreaterThanOrEqual(1)
      expect(freshConnection.listenerCount('close')).toBeGreaterThanOrEqual(1)
      expect(freshChannel.listenerCount('error')).toBeGreaterThanOrEqual(1)
      expect(freshChannel.listenerCount('close')).toBeGreaterThanOrEqual(1)
    })

    it('should not trigger concurrent reconnection attempts', async () => {
      const freshChannel = createMockChannel()
      const freshConnection = createMockConnection(freshChannel)
      vi.mocked(amqplibMod.default.connect).mockResolvedValue(freshConnection as any)

      // Emit close from both connection and channel
      mockConnection.emit('close')
      mockChannel.emit('close')

      await vi.advanceTimersByTimeAsync(1000)

      // Only one additional connect call despite two close events
      expect(amqplibMod.default.connect).toHaveBeenCalledTimes(2)
    })
  })

  // ────────────────────────────────────────────────────────────
  // New tests: Re-subscription after reconnect
  // ────────────────────────────────────────────────────────────
  describe('re-subscription after reconnect', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.spyOn(Math, 'random').mockReturnValue(1)
    })

    afterEach(() => {
      vi.useRealTimers()
      vi.restoreAllMocks()
    })

    it('should re-create queues, bindings, consumers after reconnect', async () => {
      bus.subscribe('product.*', vi.fn())
      await vi.advanceTimersByTimeAsync(0)

      const freshChannel = createMockChannel()
      const freshConnection = createMockConnection(freshChannel)
      vi.mocked(amqplibMod.default.connect).mockResolvedValue(freshConnection as any)

      mockConnection.emit('close')
      await vi.advanceTimersByTimeAsync(1000)

      expect(freshChannel.assertQueue).toHaveBeenCalled()
      expect(freshChannel.bindQueue).toHaveBeenCalledWith('q-1', 'czo.events', 'product.*')
      expect(freshChannel.consume).toHaveBeenCalled()
    })

    it('should skip unsubscribed patterns during resubscription', async () => {
      const unsub = bus.subscribe('product.*', vi.fn())
      bus.subscribe('order.*', vi.fn())
      await vi.advanceTimersByTimeAsync(0)

      // Unsubscribe the first one
      unsub()

      const freshChannel = createMockChannel()
      const freshConnection = createMockConnection(freshChannel)
      vi.mocked(amqplibMod.default.connect).mockResolvedValue(freshConnection as any)

      mockConnection.emit('close')
      await vi.advanceTimersByTimeAsync(1000)

      // Only order.* should be re-subscribed
      const bindCalls = freshChannel.bindQueue.mock.calls
      expect(bindCalls).toHaveLength(1)
      expect(bindCalls[0][2]).toBe('order.*')
    })

    it('should use new consumer tags after reconnect', async () => {
      bus.subscribe('product.*', vi.fn())
      await vi.advanceTimersByTimeAsync(0)

      const freshChannel = createMockChannel()
      const freshConnection = createMockConnection(freshChannel)
      vi.mocked(amqplibMod.default.connect).mockResolvedValue(freshConnection as any)

      mockConnection.emit('close')
      await vi.advanceTimersByTimeAsync(1000)

      expect(freshChannel.consume).toHaveBeenCalled()
      // The new channel's consume was called, which assigns new consumer tags
      const newConsumeResult = await freshChannel.consume.mock.results[0]?.value
      expect(newConsumeResult).toBeDefined()
      expect(newConsumeResult.consumerTag).toBeDefined()
    })

    it('should deliver messages to re-subscribed handlers', async () => {
      const handler = vi.fn()
      bus.subscribe('product.created', handler)
      await vi.advanceTimersByTimeAsync(0)

      const freshChannel = createMockChannel()
      const freshConnection = createMockConnection(freshChannel)
      vi.mocked(amqplibMod.default.connect).mockResolvedValue(freshConnection as any)

      mockConnection.emit('close')
      await vi.advanceTimersByTimeAsync(1000)

      // Get the consume callback registered on the fresh channel
      const freshConsumeCallback = freshChannel.consume.mock.calls[0]?.[1]
      expect(freshConsumeCallback).toBeDefined()

      const event = makeEvent('product.created', { id: '1' })
      const msg = {
        content: Buffer.from(JSON.stringify(event)),
        fields: { routingKey: 'product.created' },
        properties: {},
      }

      freshConsumeCallback!(msg)
      await vi.advanceTimersByTimeAsync(0)

      expect(handler).toHaveBeenCalledOnce()
      expect(handler.mock.calls[0][0].type).toBe('product.created')
    })
  })

  // ────────────────────────────────────────────────────────────
  // New tests: Publish buffering
  // ────────────────────────────────────────────────────────────
  describe('publish buffering', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.spyOn(Math, 'random').mockReturnValue(1)
    })

    afterEach(() => {
      vi.useRealTimers()
      vi.restoreAllMocks()
    })

    it('should buffer publishes during reconnection and flush after recovery', async () => {
      const freshChannel = createMockChannel()
      const freshConnection = createMockConnection(freshChannel)
      vi.mocked(amqplibMod.default.connect).mockResolvedValue(freshConnection as any)

      // Trigger reconnecting state
      mockConnection.emit('close')

      // Publish during reconnection — should be buffered
      const event = makeEvent('product.created', { id: 'buffered-1' })
      const publishPromise = bus.publish(event)

      // Advance timer to trigger reconnect
      await vi.advanceTimersByTimeAsync(1000)

      // The publish should now resolve
      await publishPromise

      // The fresh channel should have received the buffered event
      expect(freshChannel.publish).toHaveBeenCalledWith(
        'czo.events',
        'product.created',
        expect.any(Buffer),
        expect.objectContaining({ persistent: true }),
        expect.any(Function),
      )
    })

    it('should reject when publish buffer is full', async () => {
      const tinyChannel = createMockChannel()
      const tinyConnection = createMockConnection(tinyChannel)
      vi.mocked(amqplibMod.default.connect).mockResolvedValue(tinyConnection as any)

      const tinyBufferBus = await createRabbitMQEventBus({
        ...defaultConfig,
        reconnect: { publishBufferSize: 2 },
      })

      tinyConnection.emit('close')

      // Fill the buffer
      const p1 = tinyBufferBus.publish(makeEvent('e1'))
      const p2 = tinyBufferBus.publish(makeEvent('e2'))

      // Third should throw immediately
      await expect(tinyBufferBus.publish(makeEvent('e3'))).rejects.toThrow('Publish buffer is full')

      // Cleanup: reconnect so buffered promises resolve
      const freshCh = createMockChannel()
      vi.mocked(amqplibMod.default.connect).mockResolvedValue(createMockConnection(freshCh) as any)
      await vi.advanceTimersByTimeAsync(1000)
      await Promise.allSettled([p1, p2])

      await tinyBufferBus.shutdown()
    })

    it('should reject buffered publishes after explicit shutdown', async () => {
      // Trigger reconnecting state
      mockConnection.emit('close')

      const event = makeEvent('product.created')
      const publishPromise = bus.publish(event)

      // Shutdown while reconnecting
      await bus.shutdown()

      await expect(publishPromise).rejects.toThrow('EventBus is shutting down')
    })

    it('should reject publish when bus is closed', async () => {
      await bus.shutdown()

      await expect(bus.publish(makeEvent('test'))).rejects.toThrow('EventBus is closed')
    })

    it('should reject buffered publishes when maxAttempts exceeded', async () => {
      const limitedChannel = createMockChannel()
      const limitedConnection = createMockConnection(limitedChannel)
      vi.mocked(amqplibMod.default.connect).mockResolvedValue(limitedConnection as any)

      const limitedBus = await createRabbitMQEventBus({
        ...defaultConfig,
        reconnect: { maxAttempts: 1, initialDelayMs: 100 },
      })

      // Set up failure for reconnection
      vi.mocked(amqplibMod.default.connect)
        .mockRejectedValueOnce(new Error('fail-1'))

      limitedConnection.emit('close')

      const event = makeEvent('product.created')
      const publishPromise = limitedBus.publish(event)

      // Attach rejection handler BEFORE advancing timers to avoid unhandled rejection
      const expectation = expect(publishPromise).rejects.toThrow('Max reconnection attempts exceeded')

      // Advance through the single attempt
      await vi.advanceTimersByTimeAsync(100)

      await expectation
    })
  })
})
