import type { CzoConfig } from './config-defaults'
import process from 'node:process'
import { useRuntimeConfig } from 'nitro/runtime-config'
import { buildEventBusConfig, buildTelemetryConfig, czoConfigDefaults } from './config-defaults'

export type { CzoConfig } from './config-defaults'
export { buildTelemetryConfig, czoConfigDefaults, telemetryConfigDefaults } from './config-defaults'

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
