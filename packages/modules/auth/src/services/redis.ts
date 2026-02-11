import { useCzoConfig } from '@czo/kit/config'
import Redis from 'ioredis'

let instance: Redis | undefined

export function useAuthRedis(): Redis {
  if (!instance) {
    const { redisUrl } = useCzoConfig()
    if (!redisUrl) {
      throw new Error(
        'Redis URL is required for auth Redis features. '
        + 'Set NITRO_CZO_REDIS_URL or configure runtimeConfig.czo.redisUrl',
      )
    }
    instance = new Redis(redisUrl, { maxRetriesPerRequest: null })
  }
  return instance
}

export function resetAuthRedis(): void {
  if (instance) {
    instance.disconnect()
  }
  instance = undefined
}
