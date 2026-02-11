import type Redis from 'ioredis'

export interface SecondaryStorage {
  get: (key: string) => Promise<string | null>
  set: (key: string, value: string, ttl?: number) => Promise<void>
  delete: (key: string) => Promise<void>
}

export function createRedisStorage(redis: Redis): SecondaryStorage {
  return {
    async get(key: string): Promise<string | null> {
      return redis.get(key)
    },

    async set(key: string, value: string, ttl?: number): Promise<void> {
      if (ttl) {
        await redis.setex(key, ttl, value)
      }
      else {
        await redis.set(key, value)
      }
    },

    async delete(key: string): Promise<void> {
      await redis.del(key)
    },
  }
}
