import type { DomainEvent, EventBus, RabbitMQConfig } from '../types'
import { Buffer } from 'node:buffer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDomainEvent } from '../domain-event'

const MOCK_UUID = '550e8400-e29b-41d4-a716-446655440000'
vi.stubGlobal('crypto', { randomUUID: () => MOCK_UUID })

// --- amqplib mock ---
const mockConsumerTag = 'ctag-1'
let consumeCallback: ((msg: any) => void) | null = null

const mockChannel = {
  assertExchange: vi.fn().mockResolvedValue(undefined),
  assertQueue: vi.fn().mockResolvedValue({ queue: 'q-1' }),
  bindQueue: vi.fn().mockResolvedValue(undefined),
  publish: vi.fn().mockImplementation((_ex, _rk, _buf, _opts, cb) => {
    if (cb)
      cb(null)
    return true
  }),
  consume: vi.fn().mockImplementation((_queue, cb) => {
    consumeCallback = cb
    return Promise.resolve({ consumerTag: mockConsumerTag })
  }),
  cancel: vi.fn().mockResolvedValue(undefined),
  ack: vi.fn(),
  nack: vi.fn(),
  prefetch: vi.fn(),
  deleteQueue: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
  waitForConfirms: vi.fn().mockResolvedValue(undefined),
}

const mockConnection = {
  createConfirmChannel: vi.fn().mockResolvedValue(mockChannel),
  close: vi.fn().mockResolvedValue(undefined),
}

vi.mock('amqplib', () => ({
  default: {
    connect: vi.fn().mockResolvedValue(mockConnection),
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

  beforeEach(async () => {
    vi.clearAllMocks()
    consumeCallback = null

    const mod = await import('./rabbitmq')
    createRabbitMQEventBus = mod.createRabbitMQEventBus
    bus = await createRabbitMQEventBus(defaultConfig)
  })

  afterEach(async () => {
    await bus.shutdown()
  })

  describe('connection setup', () => {
    it('should connect to RabbitMQ', async () => {
      const amqplib = await import('amqplib')
      expect(amqplib.default.connect).toHaveBeenCalledWith(defaultConfig.url)
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

      // Give the async setup a tick
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

      expect(mockChannel.cancel).toHaveBeenCalledWith(mockConsumerTag)
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
      const minimalConfig: RabbitMQConfig = { url: 'amqp://localhost:5672' }

      await createRabbitMQEventBus(minimalConfig)

      expect(mockChannel.assertExchange).toHaveBeenCalledWith(
        'czo.events',
        'topic',
        { durable: true },
      )
      expect(mockChannel.prefetch).toHaveBeenCalledWith(10)
    })
  })
})
