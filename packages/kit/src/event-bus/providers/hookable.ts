import type { DomainEvent, DomainEventHandler, EventErrorHandler, HookableEventBus, PublishHook, SubscribeOptions, Unsubscribe } from '../types'
import { runWithContext } from '@czo/kit/telemetry'

interface Subscription {
  pattern: string
  regex: RegExp
  handler: DomainEventHandler
  onError?: EventErrorHandler
}

/**
 * Convert an AMQP-style pattern to a RegExp:
 * - `*` matches exactly one dot-delimited word
 * - `#` matches zero or more dot-delimited words
 */
function patternToRegex(pattern: string): RegExp {
  const parts = pattern.split('.')
  const regexParts = parts.map((part) => {
    if (part === '#')
      return '([a-zA-Z0-9_-]+(\\.[a-zA-Z0-9_-]+)*)?'
    if (part === '*')
      return '[a-zA-Z0-9_-]+'
    return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  })

  // Join with dots, but # can match empty so handle that
  let regex = ''
  for (let i = 0; i < regexParts.length; i++) {
    if (parts[i] === '#') {
      if (i === 0 && regexParts.length === 1) {
        // Standalone # — matches everything
        regex = '.*'
        break
      }
      if (i === 0) {
        // # at start: optional prefix
        regex += `(${regexParts[i]}\\.)?`
      }
      else if (i === regexParts.length - 1) {
        // # at end: optional suffix
        regex += `(\\.${regexParts[i]})?`
      }
      else {
        // # in middle
        regex += `(\\.${regexParts[i]}\\.)?`
      }
    }
    else {
      if (i > 0 && parts[i - 1] !== '#') {
        regex += '\\.'
      }
      regex += regexParts[i]
    }
  }

  return new RegExp(`^${regex}$`)
}

export interface CreateHookableEventBusOptions {
  /**
   * If true, handlers are awaited one after another (serial).
   * If false (default), handlers run concurrently via Promise.allSettled.
   */
  serial?: boolean
}

/**
 * Create an in-memory EventBus backed by hookable's EventEmitter.
 *
 * Implements AMQP-style pattern matching (`*` and `#` wildcards).
 * Handler execution is parallel by default; pass `{ serial: true }`
 * to run handlers sequentially.
 */
export async function createHookableEventBus(
  options: CreateHookableEventBusOptions = {},
): Promise<HookableEventBus> {
  const { serial = false } = options
  let subscriptions: Subscription[] = []
  const noop: PublishHook = () => undefined
  let publishHook: PublishHook = noop

  const runHandler = async (sub: Subscription, event: DomainEvent): Promise<void> => {
    const ctx = {
      correlationId: event.metadata.correlationId ?? crypto.randomUUID(),
    }
    try {
      await runWithContext(ctx, () => sub.handler(event))
    }
    catch (err) {
      await runWithContext(ctx, () => sub.onError?.(err, event))
    }
  }

  const publish = async (event: DomainEvent): Promise<unknown> => {
    const matching = subscriptions.filter(sub => sub.regex.test(event.type))

    if (matching.length > 0) {
      if (serial) {
        for (const sub of matching) {
          await runHandler(sub, event)
        }
      }
      else {
        await Promise.allSettled(matching.map(sub => runHandler(sub, event)))
      }
    }

    return publishHook(event)
  }

  const subscribe = <T = unknown>(
    pattern: string,
    handler: DomainEventHandler<T>,
    options?: SubscribeOptions<T>,
  ): Unsubscribe => {
    const subscription: Subscription = {
      pattern,
      regex: patternToRegex(pattern),
      handler: handler as DomainEventHandler,
      onError: options?.onError as EventErrorHandler | undefined,
    }
    subscriptions = [...subscriptions, subscription]

    return () => {
      subscriptions = subscriptions.filter(s => s !== subscription)
    }
  }

  const onPublish = (hook: PublishHook): void => {
    publishHook = hook
  }

  const shutdown = async (): Promise<void> => {
    subscriptions = []
    publishHook = noop
  }

  return { publish, subscribe, shutdown, onPublish }
}
