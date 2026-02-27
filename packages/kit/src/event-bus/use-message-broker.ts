import type { EventBus } from './types'
import { useContainer } from '@czo/kit/ioc'
import { createRabbitMQEventBus } from './providers/rabbitmq'

let instance: EventBus | undefined
let instancePromise: Promise<EventBus> | undefined

async function createBroker(): Promise<EventBus> {
  try {
    const config = (await useContainer().make('config')).rabbitmq

    if (config?.url)
      return createRabbitMQEventBus(config)
  }
  catch {}

  throw new Error('MessageBroker: messageBroker config with a valid url is required')
}

/**
 * Get the singleton RabbitMQ message broker instance.
 * Used for inter-service messaging. Throws if messageBroker is not configured.
 */
export async function useMessageBroker(): Promise<EventBus> {
  if (instance)
    return instance

  if (!instancePromise) {
    instancePromise = createBroker().then((bus) => {
      instance = bus
      return bus
    })
  }

  return instancePromise
}

/**
 * Reset the singleton for testing.
 * Does NOT close connections — use `shutdownMessageBroker()` for graceful shutdown.
 */
export function resetMessageBroker(): void {
  instance = undefined
  instancePromise = undefined
}

/**
 * Gracefully shut down the RabbitMQ message broker.
 */
export async function shutdownMessageBroker(): Promise<void> {
  if (!instance)
    return

  await instance.shutdown()
  resetMessageBroker()
}
