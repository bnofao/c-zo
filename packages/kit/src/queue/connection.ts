import type Redis from 'ioredis'
import { useContainer } from '@czo/kit/ioc'
import { useStorage } from 'nitro/storage'

let connection: Redis | undefined

export function registerQueueConnection(redis: Redis): void {
  if (connection) {
    throw new Error('Queue connection already registered')
  }
  connection = redis
}

export async function getQueueConnection(): Promise<Redis> {
  if (connection)
    return connection

  try {
    const config = await useContainer().make('config')
    const queueConfig = config.queue

    if (queueConfig) {
      const storage = useStorage(queueConfig.storage)
      const redis = storage.getMount(queueConfig.storage).driver.getInstance?.()

      if (redis) {
        connection = redis
        return redis
      }
    }
  }
  catch {}

  throw new Error(
    'Queue connection not registered. '
    + 'Call registerQueueConnection() from a plugin, or set queue.storage in config.',
  )
}

export function resetQueueConnection(): void {
  connection = undefined
}

export async function closeQueueConnection(): Promise<void> {
  if (connection) {
    connection.disconnect()
    connection = undefined
  }
}
