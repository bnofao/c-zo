import type { EventBus, EventMap } from '@czo/kit/event-bus'
import type { AuthEventType } from './types'
import { useLogger } from '@czo/kit'
import { createDomainEvent, useHookable } from '@czo/kit/event-bus'

const logger = useLogger('auth:events')

let busPromise: Promise<EventBus> | undefined

function getBus(): Promise<EventBus> {
  if (!busPromise) {
    busPromise = useHookable().catch((err) => {
      busPromise = undefined
      throw err
    })
  }
  return busPromise
}

export async function publishAuthEvent<K extends AuthEventType>(
  type: K,
  payload: EventMap[K],
): Promise<void> {
  try {
    const bus = await getBus()
    const event = createDomainEvent({
      type,
      payload,
      metadata: { source: 'auth' },
    })
    await bus.publish(event)
  }
  catch (err) {
    logger.warn(`Failed to publish ${type} event`, (err as Error).message)
  }
}

export function resetPublishAuthEvent(): void {
  busPromise = undefined
}
