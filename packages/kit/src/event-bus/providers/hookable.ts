import type { DomainEvent, DomainEventHandler, EventBus, Unsubscribe } from '../types'
import { runWithContext } from '../../telemetry/context'

interface Subscription {
  pattern: string
  regex: RegExp
  handler: DomainEventHandler
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

/**
 * Create an in-memory EventBus backed by hookable's EventEmitter.
 *
 * Implements AMQP-style pattern matching (`*` and `#` wildcards)
 * with parallel handler execution via `Promise.allSettled()`.
 */
export async function createHookableEventBus(): Promise<EventBus> {
  let subscriptions: Subscription[] = []

  const publish = async (event: DomainEvent): Promise<void> => {
    const matching = subscriptions.filter(sub => sub.regex.test(event.type))
    if (matching.length === 0)
      return

    await Promise.allSettled(
      matching.map(async (sub) => {
        try {
          const ctx = {
            correlationId: event.metadata.correlationId ?? crypto.randomUUID(),
          }
          await runWithContext(ctx, () => sub.handler(event))
        }
        catch {
          // Swallow — domain event handlers must not break publishers
        }
      }),
    )
  }

  const subscribe = (pattern: string, handler: DomainEventHandler): Unsubscribe => {
    const subscription: Subscription = {
      pattern,
      regex: patternToRegex(pattern),
      handler,
    }
    subscriptions = [...subscriptions, subscription]

    return () => {
      subscriptions = subscriptions.filter(s => s !== subscription)
    }
  }

  const shutdown = async (): Promise<void> => {
    subscriptions = []
  }

  return { publish, subscribe, shutdown }
}
