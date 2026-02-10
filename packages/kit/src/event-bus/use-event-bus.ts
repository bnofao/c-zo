import type { DomainEvent, DomainEventHandler, EventBus, Unsubscribe } from './types'
import { useCzoConfig } from '../config'
import { createHookableEventBus } from './providers/hookable'
import { createRabbitMQEventBus } from './providers/rabbitmq'

let instance: EventBus | undefined
let instancePromise: Promise<EventBus> | undefined
let hookableBus: EventBus | undefined
let rabbitBus: EventBus | undefined

async function createBus(): Promise<EventBus> {
  const { eventBus: config } = useCzoConfig()

  if (config.provider === 'hookable' && !config.dualWrite) {
    hookableBus = await createHookableEventBus()
    return hookableBus
  }

  if (config.provider === 'rabbitmq' && !config.dualWrite) {
    rabbitBus = await createRabbitMQEventBus(config.rabbitmq!)
    return rabbitBus
  }

  // Dual-write mode: publish to both, subscribe from primary (rabbitmq)
  hookableBus = await createHookableEventBus()
  rabbitBus = await createRabbitMQEventBus(config.rabbitmq!)

  const dualWriteBus: EventBus = {
    async publish(event: DomainEvent): Promise<void> {
      await Promise.allSettled([
        hookableBus!.publish(event),
        rabbitBus!.publish(event),
      ])
    },

    subscribe(pattern: string, handler: DomainEventHandler): Unsubscribe {
      return rabbitBus!.subscribe(pattern, handler)
    },

    async shutdown(): Promise<void> {
      await Promise.allSettled([
        hookableBus!.shutdown(),
        rabbitBus!.shutdown(),
      ])
    },
  }

  return dualWriteBus
}

/**
 * Get the singleton EventBus instance.
 * Creates the bus on first call based on `useCzoConfig().eventBus`.
 */
export async function useEventBus(): Promise<EventBus> {
  if (instance)
    return instance

  if (!instancePromise) {
    instancePromise = createBus().then((bus) => {
      instance = bus
      return bus
    })
  }

  return instancePromise
}

/**
 * Reset the singleton for testing.
 * Does NOT close connections — use `shutdownEventBus()` for graceful shutdown.
 */
export function resetEventBus(): void {
  instance = undefined
  instancePromise = undefined
  hookableBus = undefined
  rabbitBus = undefined
}

/**
 * Gracefully shut down the EventBus and all underlying providers.
 */
export async function shutdownEventBus(): Promise<void> {
  if (!instance)
    return

  await instance.shutdown()
  resetEventBus()
}
