import type { EventEmitter } from './types'
import { createEventEmitter } from './emitter'

export { createEventEmitter } from './emitter'
export type { EventContext, EventEmitter, EventHandler, EventMap } from './types'

export function useEvents(): EventEmitter {
  return ((useEvents as any).__instance__ ??= createEventEmitter())
}
