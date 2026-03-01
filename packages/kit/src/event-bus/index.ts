export {
  createDomainEvent,
  domainEventSchema,
  validateDomainEvent,
} from './domain-event'

export type {
  CreateDomainEventOptions,
  ValidatedDomainEvent,
} from './domain-event'

export { checkRabbitMQHealth } from './health'
export type { RabbitMQHealthResult } from './health'

export { createEventBusMetrics, instrumentEventBus } from './instrumentation'
export type { EventBusMetrics, InstrumentEventBusOptions } from './instrumentation'
export { createHookableEventBus } from './providers/hookable'

export { createRabbitMQEventBus } from './providers/rabbitmq'
export type {
  DomainEvent,
  DomainEventHandler,
  EventBus,
  EventMap,
  EventMetadata,
  EventPayload,
  EventType,
  HookableEventBus,
  MessageBrokerConfig,
  PublishHook,
  RabbitMQConfig,
  RabbitMQReconnectConfig,
  Unsubscribe,
} from './types'
export { resetHookable, shutdownHookable, useHookable } from './use-hookable'
export { resetMessageBroker, shutdownMessageBroker, useMessageBroker } from './use-message-broker'
