import type { DomainEvent, DomainEventHandler, EventBus, RabbitMQConfig, Unsubscribe } from '../types'
import { Buffer } from 'node:buffer'
import amqplib from 'amqplib'
import { useLogger } from '../../logger'

type BusState = 'connected' | 'reconnecting' | 'closed'

interface SubscriptionRecord {
  readonly pattern: string
  readonly handler: DomainEventHandler
  /** Mutable: assigned after async consumer setup, read by unsubscribe closure */
  consumerTag: string | undefined
  queue: string | undefined
  active: boolean
}

interface BufferedPublish {
  readonly event: DomainEvent
  readonly resolve: () => void
  readonly reject: (err: Error) => void
}

const DEFAULTS = {
  exchange: 'czo.events',
  deadLetterExchange: 'czo.dlx',
  prefetch: 10,
  publisherConfirms: true,
} as const

const RECONNECT_DEFAULTS = {
  enabled: true,
  initialDelayMs: 1000,
  maxDelayMs: 30_000,
  multiplier: 2,
  maxAttempts: 0,
  publishBufferSize: 1000,
} as const

function toUnixSeconds(isoTimestamp: string): number {
  return Math.floor(Date.parse(isoTimestamp) / 1000)
}

/**
 * Create an EventBus backed by RabbitMQ via amqplib.
 *
 * Uses a topic exchange for AMQP-native wildcard routing.
 * Publisher confirms ensure events are durably queued before `publish()` resolves.
 * Automatically reconnects with exponential backoff on connection/channel loss.
 */
export async function createRabbitMQEventBus(config: RabbitMQConfig): Promise<EventBus> {
  const logger = useLogger('event-bus:rabbitmq')

  const exchange = config.exchange ?? DEFAULTS.exchange
  const dlx = config.deadLetterExchange ?? DEFAULTS.deadLetterExchange
  const prefetch = config.prefetch ?? DEFAULTS.prefetch

  const reconnectConfig = {
    enabled: config.reconnect?.enabled ?? RECONNECT_DEFAULTS.enabled,
    initialDelayMs: config.reconnect?.initialDelayMs ?? RECONNECT_DEFAULTS.initialDelayMs,
    maxDelayMs: config.reconnect?.maxDelayMs ?? RECONNECT_DEFAULTS.maxDelayMs,
    multiplier: config.reconnect?.multiplier ?? RECONNECT_DEFAULTS.multiplier,
    maxAttempts: config.reconnect?.maxAttempts ?? RECONNECT_DEFAULTS.maxAttempts,
    publishBufferSize: config.reconnect?.publishBufferSize ?? RECONNECT_DEFAULTS.publishBufferSize,
  }

  let connection = await amqplib.connect(config.url)
  let channel = await connection.createConfirmChannel()

  await channel.assertExchange(exchange, 'topic', { durable: true })
  await channel.assertExchange(dlx, 'topic', { durable: true })
  channel.prefetch(prefetch)

  let state: BusState = 'connected'
  let subscriptions: readonly SubscriptionRecord[] = []
  let publishBuffer: BufferedPublish[] = []
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined
  let reconnectAttempt = 0

  /** Defeats TS control-flow narrowing — state can change across await boundaries */
  function isClosed(): boolean {
    return state === 'closed'
  }

  function removeRecord(target: SubscriptionRecord): void {
    subscriptions = subscriptions.filter(r => r !== target)
  }

  async function setupConsumer(record: SubscriptionRecord): Promise<void> {
    try {
      // Capture channel at setup time — the outer `channel` variable may be
      // reassigned during reconnection while a handler is still executing.
      const consumerChannel = channel

      const { queue } = await consumerChannel.assertQueue('', {
        exclusive: true,
        durable: false,
        arguments: { 'x-dead-letter-exchange': dlx },
      })

      await consumerChannel.bindQueue(queue, exchange, record.pattern)

      const result = await consumerChannel.consume(queue, async (msg) => {
        if (!msg)
          return

        try {
          const event = JSON.parse(msg.content.toString()) as DomainEvent
          await record.handler(event)
          consumerChannel.ack(msg)
        }
        catch {
          consumerChannel.nack(msg, false, false)
        }
      })

      record.consumerTag = result.consumerTag
      record.queue = queue
    }
    catch (err) {
      if (isClosed())
        return
      throw err
    }
  }

  async function resubscribeAll(): Promise<void> {
    for (const record of subscriptions) {
      if (record.active && !isClosed()) {
        await setupConsumer(record)
      }
    }
  }

  function flushPublishBuffer(): void {
    const pending = [...publishBuffer]
    publishBuffer = []

    for (const item of pending) {
      const buffer = Buffer.from(JSON.stringify(item.event))
      channel.publish(
        exchange,
        item.event.type,
        buffer,
        {
          persistent: true,
          contentType: 'application/json',
          messageId: item.event.id,
          timestamp: toUnixSeconds(item.event.timestamp),
        },
        (err) => {
          if (err)
            item.reject(err)
          else item.resolve()
        },
      )
    }
  }

  function rejectAllBuffered(reason: string): void {
    const pending = [...publishBuffer]
    publishBuffer = []
    for (const item of pending) {
      item.reject(new Error(reason))
    }
  }

  function detachListeners(): void {
    connection.removeAllListeners('error')
    connection.removeAllListeners('close')
    channel.removeAllListeners('error')
    channel.removeAllListeners('close')
    channel.removeAllListeners('return')
  }

  function attachListeners(): void {
    connection.on('error', (err: Error) => {
      logger.error('Connection error:', err)
    })

    connection.on('close', () => {
      if (state !== 'closed') {
        logger.warn('Connection closed unexpectedly')
        scheduleReconnect()
      }
    })

    channel.on('error', (err: Error) => {
      logger.error('Channel error:', err)
    })

    channel.on('close', () => {
      if (state !== 'closed') {
        logger.warn('Channel closed unexpectedly')
        scheduleReconnect()
      }
    })

    channel.on('return', (msg: unknown) => {
      logger.warn('Message returned (unroutable):', msg)
    })
  }

  function scheduleReconnect(): void {
    if (state === 'reconnecting' || state === 'closed')
      return
    if (!reconnectConfig.enabled)
      return

    state = 'reconnecting'
    reconnectAttempt = 0
    attemptReconnect()
  }

  function attemptReconnect(): void {
    if (isClosed())
      return

    if (reconnectConfig.maxAttempts > 0 && reconnectAttempt >= reconnectConfig.maxAttempts) {
      logger.error(`Max reconnection attempts (${reconnectConfig.maxAttempts}) exceeded`)
      rejectAllBuffered('Max reconnection attempts exceeded')
      state = 'closed'
      return
    }

    const baseDelay = Math.min(
      reconnectConfig.initialDelayMs * (reconnectConfig.multiplier ** reconnectAttempt),
      reconnectConfig.maxDelayMs,
    )
    const delay = Math.floor(baseDelay * (0.5 + Math.random() * 0.5))

    logger.info(`Reconnecting in ${delay}ms (attempt ${reconnectAttempt + 1})`)

    reconnectTimer = setTimeout(async () => {
      try {
        // Detach listeners from old objects to prevent stale close/error events
        detachListeners()

        connection = await amqplib.connect(config.url)

        if (isClosed()) {
          await connection.close()
          return
        }

        channel = await connection.createConfirmChannel()

        if (isClosed()) {
          await channel.close()
          await connection.close()
          return
        }

        await channel.assertExchange(exchange, 'topic', { durable: true })
        await channel.assertExchange(dlx, 'topic', { durable: true })
        channel.prefetch(prefetch)

        attachListeners()
        await resubscribeAll()

        // Flush buffer BEFORE transitioning to 'connected' to prevent
        // new publish() calls from interleaving with buffered events
        flushPublishBuffer()

        state = 'connected'
        reconnectAttempt = 0
        logger.info('Reconnected successfully')
      }
      catch (err) {
        if (isClosed())
          return
        logger.error('Reconnection attempt failed:', err)
        reconnectAttempt++
        attemptReconnect()
      }
    }, delay)
  }

  attachListeners()

  const publish = async (event: DomainEvent): Promise<void> => {
    if (state === 'closed') {
      throw new Error('EventBus is closed')
    }

    if (state === 'reconnecting') {
      if (publishBuffer.length >= reconnectConfig.publishBufferSize) {
        throw new Error('Publish buffer is full')
      }
      return new Promise<void>((resolve, reject) => {
        publishBuffer = [...publishBuffer, { event, resolve, reject }]
      })
    }

    const buffer = Buffer.from(JSON.stringify(event))
    await new Promise<void>((resolve, reject) => {
      channel.publish(
        exchange,
        event.type,
        buffer,
        {
          persistent: true,
          contentType: 'application/json',
          messageId: event.id,
          timestamp: toUnixSeconds(event.timestamp),
        },
        (err) => {
          if (err)
            reject(err)
          else resolve()
        },
      )
    })
  }

  const subscribe = (pattern: string, handler: DomainEventHandler): Unsubscribe => {
    const record: SubscriptionRecord = {
      pattern,
      handler,
      consumerTag: undefined,
      queue: undefined,
      active: true,
    }

    subscriptions = [...subscriptions, record]

    setupConsumer(record).catch((err) => {
      logger.error(`Failed to setup consumer for ${pattern}:`, err)
    })

    return () => {
      record.active = false
      removeRecord(record)
      if (record.consumerTag) {
        channel.cancel(record.consumerTag).catch(() => {
          // Channel may already be dead during reconnection
        })
      }
    }
  }

  const shutdown = async (): Promise<void> => {
    if (state === 'closed')
      return
    state = 'closed'

    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = undefined
    }

    rejectAllBuffered('EventBus is shutting down')

    for (const record of subscriptions) {
      if (record.consumerTag) {
        try {
          await channel.cancel(record.consumerTag)
        }
        catch {
          // Channel may already be dead
        }
      }
    }
    subscriptions = []

    try {
      await channel.close()
    }
    catch {
      // Channel may already be closed
    }

    try {
      await connection.close()
    }
    catch {
      // Connection may already be closed
    }
  }

  return { publish, subscribe, shutdown }
}
