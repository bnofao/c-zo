import type { EventContext, EventEmitter } from './types'
import { createHooks } from 'hookable'

type WrappedHandler = (payload: unknown, context: EventContext) => Promise<void> | void

export function createEventEmitter(): EventEmitter {
  const hooks = createHooks<Record<string, WrappedHandler>>()
  const handlerMap = new Map<string, Set<WrappedHandler>>()

  function buildContext(): EventContext {
    return {
      eventId: crypto.randomUUID(),
      timestamp: new Date(),
    }
  }

  function trackHandler(event: string, handler: WrappedHandler): void {
    let set = handlerMap.get(event)
    if (!set) {
      set = new Set()
      handlerMap.set(event, set)
    }
    set.add(handler)
  }

  function untrackHandler(event: string, handler: WrappedHandler): void {
    const set = handlerMap.get(event)
    if (set) {
      set.delete(handler)
      if (set.size === 0) {
        handlerMap.delete(event)
      }
    }
  }

  return {
    async emit(event, payload) {
      const context = buildContext()
      await hooks.callHook(event, payload, context)
    },

    on(event, handler) {
      const wrappedHandler = handler as WrappedHandler
      trackHandler(event, wrappedHandler)
      const unhook = hooks.hook(event, wrappedHandler)

      return () => {
        unhook()
        untrackHandler(event, wrappedHandler)
      }
    },

    once(event, handler) {
      const wrappedHandler = handler as WrappedHandler
      trackHandler(event, wrappedHandler)
      const unhook = hooks.hookOnce(event, wrappedHandler)

      return () => {
        unhook()
        untrackHandler(event, wrappedHandler)
      }
    },

    off(event, handler) {
      if (handler) {
        const wrappedHandler = handler as WrappedHandler
        hooks.removeHook(event, wrappedHandler)
        untrackHandler(event, wrappedHandler)
      }
      else {
        const set = handlerMap.get(event)
        if (set) {
          for (const h of set) {
            hooks.removeHook(event, h)
          }
          handlerMap.delete(event)
        }
      }
    },
  }
}
