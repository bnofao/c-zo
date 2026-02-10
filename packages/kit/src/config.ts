import process from 'node:process'
import { useRuntimeConfig } from 'nitro/runtime-config'

export interface CzoConfig {
  databaseUrl: string
  redisUrl: string
  queue: {
    prefix: string
    defaultAttempts: number
  }
}

export const czoConfigDefaults: CzoConfig = {
  databaseUrl: '',
  redisUrl: '',
  queue: {
    prefix: 'czo',
    defaultAttempts: 3,
  },
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
    }
  }
  catch {
    // Outside Nitro runtime (e.g., CLI commands, tests) — fallback to env
    return {
      databaseUrl: process.env.DATABASE_URL || '',
      redisUrl: process.env.REDIS_URL || '',
      queue: czoConfigDefaults.queue,
    }
  }
}
