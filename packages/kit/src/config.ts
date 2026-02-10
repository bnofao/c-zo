import type { EventBusConfig, RabbitMQConfig } from './event-bus/types'
import type { TelemetryConfig } from './telemetry/types'
import process from 'node:process'
import { useRuntimeConfig } from 'nitro/runtime-config'

export interface CzoConfig {
  databaseUrl: string
  redisUrl: string
  queue: {
    prefix: string
    defaultAttempts: number
  }
  eventBus: EventBusConfig
  telemetry: TelemetryConfig
}

const isProduction = process.env.NODE_ENV === 'production'

export const telemetryConfigDefaults: TelemetryConfig = {
  enabled: true,
  serviceName: 'czo',
  serviceVersion: '0.0.0',
  endpoint: 'http://localhost:4318',
  protocol: 'http',
  samplingRatio: isProduction ? 0.1 : 1.0,
  logBridge: false,
}

export const czoConfigDefaults: CzoConfig = {
  databaseUrl: '',
  redisUrl: '',
  queue: {
    prefix: 'czo',
    defaultAttempts: 3,
  },
  eventBus: {
    provider: 'hookable',
    source: 'monolith',
    dualWrite: false,
  },
  telemetry: { ...telemetryConfigDefaults },
}

/**
 * Access czo configuration from Nitro's runtimeConfig.
 * Works at boot time (plugins) and request time (handlers).
 * Falls back to process.env for backward compatibility.
 */
export function useCzoConfig(): CzoConfig {
  try {
    const config = useRuntimeConfig()
    const czo = (config as any).czo as Partial<CzoConfig> | undefined
    return {
      databaseUrl: czo?.databaseUrl || process.env.DATABASE_URL || '',
      redisUrl: czo?.redisUrl || process.env.REDIS_URL || '',
      queue: {
        prefix: czo?.queue?.prefix ?? czoConfigDefaults.queue.prefix,
        defaultAttempts: czo?.queue?.defaultAttempts ?? czoConfigDefaults.queue.defaultAttempts,
      },
      eventBus: buildEventBusConfig(czo?.eventBus),
      telemetry: buildTelemetryConfig(czo?.telemetry),
    }
  }
  catch {
    // Outside Nitro runtime (e.g., CLI commands, tests) — fallback to env
    return {
      databaseUrl: process.env.DATABASE_URL || '',
      redisUrl: process.env.REDIS_URL || '',
      queue: czoConfigDefaults.queue,
      eventBus: buildEventBusConfig(),
      telemetry: buildTelemetryConfig(),
    }
  }
}

export function buildTelemetryConfig(partial?: Partial<TelemetryConfig>): TelemetryConfig {
  if (!partial) {
    return { ...telemetryConfigDefaults }
  }

  return {
    enabled: partial.enabled ?? telemetryConfigDefaults.enabled,
    serviceName: partial.serviceName ?? process.env.OTEL_SERVICE_NAME ?? telemetryConfigDefaults.serviceName,
    serviceVersion: partial.serviceVersion ?? telemetryConfigDefaults.serviceVersion,
    endpoint: partial.endpoint ?? process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? telemetryConfigDefaults.endpoint,
    protocol: partial.protocol ?? telemetryConfigDefaults.protocol,
    samplingRatio: partial.samplingRatio ?? telemetryConfigDefaults.samplingRatio,
    logBridge: partial.logBridge ?? telemetryConfigDefaults.logBridge,
  }
}

function buildEventBusConfig(partial?: Partial<EventBusConfig>): EventBusConfig {
  if (!partial) {
    return { ...czoConfigDefaults.eventBus }
  }

  const rabbitmqUrl = partial.rabbitmq?.url || process.env.RABBITMQ_URL || ''

  return {
    provider: partial.provider ?? czoConfigDefaults.eventBus.provider,
    source: partial.source ?? czoConfigDefaults.eventBus.source,
    dualWrite: partial.dualWrite ?? czoConfigDefaults.eventBus.dualWrite,
    ...(rabbitmqUrl
      ? {
          rabbitmq: {
            ...partial.rabbitmq,
            url: rabbitmqUrl,
          } as RabbitMQConfig,
        }
      : {}),
  }
}
