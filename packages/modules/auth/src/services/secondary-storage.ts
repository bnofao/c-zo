import type { useStorage } from 'nitro/storage'

type Storage = ReturnType<typeof useStorage>

export interface SecondaryStorage {
  get: (key: string) => Promise<string | null>
  set: (key: string, value: string, ttl?: number) => Promise<void>
  delete: (key: string) => Promise<void>
}

export function createSecondaryStorage(storage: Storage): SecondaryStorage {
  return {
    async get(key: string): Promise<string | null> {
      return await storage.getItem<string>(key) ?? null
    },

    async set(key: string, value: string, ttl?: number): Promise<void> {
      if (ttl) {
        await storage.setItem(key, value, { ttl })
      }
      else {
        await storage.setItem(key, value)
      }
    },

    async delete(key: string): Promise<void> {
      await storage.removeItem(key)
    },
  }
}
