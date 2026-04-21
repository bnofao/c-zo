import type { NitroHooks } from 'nitro/types'
import type { EventBus, RabbitMQConfig } from './event-bus/types'
import type { Container } from './ioc'
import type { TelemetryConfig } from './telemetry/types'

export { logger, useLogger } from './logger'
export * from './types'

declare module 'nitro/types' {
  interface NitroApp {
    container: Container<Record<any, any>>
    hookable: EventBus
  }
  interface NitroRuntimeConfig {
    app: string
    baseUrl?: string
    telemetry?: TelemetryConfig
    queue?: {
      storage: string
    }
    database?: {
      url?: string
    }
    rabbitmq?: RabbitMQConfig
  }
  interface NitroRuntimeHooks {
    'czo:init': () => void
    'czo:register': () => void
    'czo:boot': () => void
  }
  interface NitroModule {
    hooks?: Partial<NitroHooks>
  }
}
