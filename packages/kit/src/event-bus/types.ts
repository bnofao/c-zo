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
}

/** A handler that processes a domain event */
export type DomainEventHandler<T = unknown> = (event: DomainEvent<T>) => Promise<void> | void

/** Function returned by subscribe() to remove the subscription */
export type Unsubscribe = () => void

/**
 * High-level EventBus interface — provider-agnostic.
 *
 * Modules interact with this interface exclusively.
 * The underlying transport (hookable, RabbitMQ) is transparent.
 */
export interface EventBus {
  /** Publish a domain event to all matching subscribers */
  publish: (event: DomainEvent) => Promise<void>

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

/**
 * Provider factory — each transport implements this to create an EventBus.
 */
export interface EventBusProvider {
  readonly name: string
  create: (config: EventBusConfig) => Promise<EventBus>
}

export interface EventBusConfig {
  /** Which provider to use */
  provider: 'hookable' | 'rabbitmq'
  /** Default source tag for events produced by this instance */
  source: string
  /** When true, publish to both hookable AND rabbitmq simultaneously */
  dualWrite: boolean
  /** RabbitMQ-specific configuration (required when provider is 'rabbitmq') */
  rabbitmq?: RabbitMQConfig
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
  /** Reconnection configuration */
  reconnect?: RabbitMQReconnectConfig
}
