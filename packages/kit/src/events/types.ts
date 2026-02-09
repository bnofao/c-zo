/**
 * Extensible event map — modules declare their events via declaration merging:
 *
 * ```ts
 * declare module '@czo/kit/events' {
 *   interface EventMap {
 *     'product:created': { id: string; title: string }
 *   }
 * }
 * ```
 */
export interface EventMap {}

export interface EventContext {
  /** Unique identifier for this event dispatch */
  eventId: string
  /** When the event was emitted */
  timestamp: Date
  /** Optional actor who triggered the event */
  actor?: string
  /** Optional correlation ID for tracing across services */
  correlationId?: string
}

export type EventHandler<T = unknown> = (payload: T, context: EventContext) => Promise<void> | void

export interface EventEmitter {
  /** Emit an event (serial handler execution via hookable) */
  emit: <K extends string>(event: K, payload: K extends keyof EventMap ? EventMap[K] : unknown) => Promise<void>

  /** Subscribe to an event — returns an unsubscribe function */
  on: <K extends string>(event: K, handler: EventHandler<K extends keyof EventMap ? EventMap[K] : unknown>) => () => void

  /** Subscribe to an event for a single invocation — returns an unsubscribe function */
  once: <K extends string>(event: K, handler: EventHandler<K extends keyof EventMap ? EventMap[K] : unknown>) => () => void

  /** Remove a specific handler, or all handlers for an event if no handler given */
  off: <K extends string>(event: K, handler?: EventHandler<K extends keyof EventMap ? EventMap[K] : unknown>) => void
}
