import type { EventBus, EventMap } from '@czo/kit/event-bus'
import type { StockLocationEventType } from './types'
import { useLogger } from '@czo/kit'
import { createDomainEvent, useHookable } from '@czo/kit/event-bus'

const logger = useLogger('stock-location:events')

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

export async function publishStockLocationEvent<K extends StockLocationEventType>(
  type: K,
  payload: EventMap[K],
): Promise<void> {
  try {
    const bus = await getBus()
    const event = createDomainEvent({
      type,
      payload,
      metadata: { source: 'stock-location' },
    })
    await bus.publish(event)
  }
  catch (err) {
    logger.warn(`Failed to publish ${type} event`, (err as Error).message)
  }
}

export function resetPublishStockLocationEvent(): void {
  busPromise = undefined
}
