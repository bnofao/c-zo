import type Redis from 'ioredis'

const KEY_PREFIX = 'czo:blocklist:'

export interface JwtBlocklist {
  add: (jti: string, ttlSeconds: number) => Promise<void>
  isBlocked: (jti: string) => Promise<boolean>
}

export function createJwtBlocklist(redis: Redis): JwtBlocklist {
  return {
    async add(jti: string, ttlSeconds: number): Promise<void> {
      await redis.setex(`${KEY_PREFIX}${jti}`, ttlSeconds, '1')
    },

    async isBlocked(jti: string): Promise<boolean> {
      const result = await redis.exists(`${KEY_PREFIX}${jti}`)
      return result === 1
    },
  }
}
