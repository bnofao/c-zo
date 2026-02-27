/**
 * Domain Event envelope — wraps any payload with routing metadata.
 */
export interface DomainEvent<T = unknown> {
  /** Unique event identifier (UUID v4) */
  readonly id: string
  /** Dot-delimited event type, e.g. "product.created" */
  readonly type: string
  /** ISO-8601 timestamp of when the event was created */
  readonly timestamp: string
  /** The event payload */
  readonly payload: T
  /** Optional metadata for routing and tracing */
  readonly metadata: EventMetadata
}

export interface EventMetadata {
  /** Service or module that produced the event */
  source: string
  /** Correlation ID for distributed tracing */
  correlationId?: string
  /** Causation ID linking to the event that caused this one */
  causationId?: string
  /** Schema version for payload evolution (default: 1) */
  version: number
  /** Tenant identifier for multi-tenant routing */
  shopId?: string
  /** Identity of the actor who triggered the event */
  actorId?: string
  /** Type of actor: human user, third-party app, or internal system */
  actorType?: 'user' | 'app' | 'system'
}

/**
 * Extensible event map — modules extend via declaration merging.
 *
 * @example
 * declare module '@czo/kit' {
 *   interface EventMap {
 *     'product.created': { id: string; title: string }
 *     'product.deleted': { id: string }
 *   }
 * }
 */
export interface EventMap {
  // Extend via declaration merging in module packages
}

/** Resolves to EventMap keys when populated, or string when empty */
export type EventType = keyof EventMap extends never ? string : keyof EventMap & string

/** Resolves payload type from event type string */
export type EventPayload<K extends string> = K extends keyof EventMap ? EventMap[K] : unknown

/** A handler that processes a domain event */
export type DomainEventHandler<T = unknown> = (event: DomainEvent<T>) => Promise<void> | void

/** Function returned by subscribe() to remove the subscription */
export type Unsubscribe = () => void

/** Hook invoked on every publish, after subscribers. Returns a value to the publisher. */
export type PublishHook = (event: DomainEvent) => Promise<unknown> | unknown

/**
 * High-level EventBus interface — provider-agnostic.
 *
 * Modules interact with this interface exclusively.
 * The underlying transport (hookable, RabbitMQ) is transparent.
 */
export interface EventBus {
  /** Publish a domain event to all matching subscribers */
  publish: (event: DomainEvent) => Promise<unknown>

  /**
   * Subscribe to events matching a pattern.
   *
   * Pattern syntax:
   * - Exact: `"product.created"` — matches only that type
   * - Single-word wildcard: `"product.*"` — matches `product.created`, `product.updated`
   * - Multi-word wildcard: `"product.#"` — matches `product.created`, `product.variant.added`
   */
  subscribe: (pattern: string, handler: DomainEventHandler) => Unsubscribe

  /** Gracefully shut down the bus (close connections, drain handlers) */
  shutdown: () => Promise<void>
}

/** Extended EventBus with a publish hook slot (hookable only). */
export interface HookableEventBus extends EventBus {
  /** Register a hook that runs on every publish. Single slot — last registration wins. */
  onPublish: (hook: PublishHook) => void
}

/**
 * Configuration for the RabbitMQ message broker.
 * Extends RabbitMQConfig with a source tag for event metadata.
 */
export interface MessageBrokerConfig extends RabbitMQConfig {
  /** Default source tag for events produced by this instance */
  source: string
}

export interface RabbitMQReconnectConfig {
  /** Whether auto-reconnection is enabled (default: true) */
  enabled?: boolean
  /** Initial delay before first reconnection attempt in ms (default: 1000) */
  initialDelayMs?: number
  /** Maximum delay between reconnection attempts in ms (default: 30000) */
  maxDelayMs?: number
  /** Multiplier for exponential backoff (default: 2) */
  multiplier?: number
  /** Maximum number of reconnection attempts, 0 = infinite (default: 0) */
  maxAttempts?: number
  /** Maximum number of events buffered during reconnection (default: 1000) */
  publishBufferSize?: number
}

export interface RabbitMQConfig {
  /** AMQP connection URL, e.g. "amqp://guest:guest@localhost:5672" */
  url: string
  /** Exchange name for domain events (default: "czo.events") */
  exchange?: string
  /** Dead-letter exchange name (default: "czo.dlx") */
  deadLetterExchange?: string
  /** Consumer prefetch count (default: 10) */
  prefetch?: number
  /** Whether to use publisher confirms (default: true) */
  publisherConfirms?: boolean
  /** System fanout exchange for infrastructure events (default: "czo.system") */
  systemExchange?: string
  /** Reconnection configuration */
  reconnect?: RabbitMQReconnectConfig
}
