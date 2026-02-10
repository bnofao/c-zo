import type { DomainEvent, DomainEventHandler, EventBus, RabbitMQConfig, Unsubscribe } from '../types'
import { Buffer } from 'node:buffer'
import amqplib from 'amqplib'

interface ActiveConsumer {
  consumerTag: string
  queue: string
}

const DEFAULTS = {
  exchange: 'czo.events',
  deadLetterExchange: 'czo.dlx',
  prefetch: 10,
  publisherConfirms: true,
} as const

/**
 * Create an EventBus backed by RabbitMQ via amqplib.
 *
 * Uses a topic exchange for AMQP-native wildcard routing.
 * Publisher confirms ensure events are durably queued before `publish()` resolves.
 */
export async function createRabbitMQEventBus(config: RabbitMQConfig): Promise<EventBus> {
  const exchange = config.exchange ?? DEFAULTS.exchange
  const dlx = config.deadLetterExchange ?? DEFAULTS.deadLetterExchange
  const prefetch = config.prefetch ?? DEFAULTS.prefetch

  const connection = await amqplib.connect(config.url)
  const channel = await connection.createConfirmChannel()

  await channel.assertExchange(exchange, 'topic', { durable: true })
  await channel.assertExchange(dlx, 'topic', { durable: true })
  channel.prefetch(prefetch)

  const consumers: ActiveConsumer[] = []
  let closed = false

  const publish = async (event: DomainEvent): Promise<void> => {
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
          timestamp: Math.floor(new Date(event.timestamp).getTime() / 1000),
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
    let consumerTag: string | undefined

    const setup = async () => {
      const { queue } = await channel.assertQueue('', {
        exclusive: true,
        durable: false,
        arguments: { 'x-dead-letter-exchange': dlx },
      })

      await channel.bindQueue(queue, exchange, pattern)

      const result = await channel.consume(queue, async (msg) => {
        if (!msg)
          return

        try {
          const event = JSON.parse(msg.content.toString()) as DomainEvent
          await handler(event)
          channel.ack(msg)
        }
        catch {
          channel.nack(msg, false, false)
        }
      })

      consumerTag = result.consumerTag
      consumers.push({ consumerTag, queue })
    }

    // Fire-and-forget the async setup
    setup()

    return () => {
      if (consumerTag) {
        channel.cancel(consumerTag)
      }
    }
  }

  const shutdown = async (): Promise<void> => {
    if (closed)
      return
    closed = true

    for (const consumer of consumers) {
      await channel.cancel(consumer.consumerTag)
    }
    consumers.length = 0

    await channel.close()
    await connection.close()
  }

  return { publish, subscribe, shutdown }
}
