import type { HookableEventBus } from './types'
import { createHookableEventBus } from './providers/hookable'

let instance: HookableEventBus | undefined
let instancePromise: Promise<HookableEventBus> | undefined

/**
 * Get the singleton in-process (hookable) EventBus instance.
 * Module consumers subscribe here for domain events within the same process.
 */
export async function useHookable(): Promise<HookableEventBus> {
  if (instance)
    return instance

  if (!instancePromise) {
    instancePromise = createHookableEventBus().then((bus) => {
      instance = bus
      return bus
    })
  }

  return instancePromise
}

/**
 * Reset the singleton for testing.
 * Does NOT close connections — use `shutdownHookable()` for graceful shutdown.
 */
export function resetHookable(): void {
  instance = undefined
  instancePromise = undefined
}

/**
 * Gracefully shut down the hookable event bus.
 */
export async function shutdownHookable(): Promise<void> {
  if (!instance)
    return

  await instance.shutdown()
  resetHookable()
}
