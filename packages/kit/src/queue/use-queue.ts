import type { QueueOptions } from 'bullmq'
import process from 'node:process'
import { Queue } from 'bullmq'
import Redis from 'ioredis'

type CachedQueue = Queue<any, any, string>

const queues = new Map<string, CachedQueue>()
let connection: Redis | undefined

function getConnection(): Redis {
  if (!connection) {
    const redisUrl = process.env.REDIS_URL
    if (!redisUrl) {
      throw new Error('REDIS_URL environment variable is required for queue support')
    }
    // maxRetriesPerRequest: null prevents ioredis from throwing
    // MaxRetriesPerRequestError during BullMQ blocking commands (BRPOPLPUSH)
    connection = new Redis(redisUrl, { maxRetriesPerRequest: null })
  }
  return connection
}

export function useQueue<D = unknown, R = unknown, N extends string = string>(
  name: N,
  opts?: Omit<QueueOptions, 'connection'>,
): Queue<D, R, N> {
  const existing = queues.get(name)
  if (existing) {
    return existing as Queue<D, R, N>
  }

  const queue = new Queue<D, R, N>(name, {
    ...opts,
    connection: getConnection(),
  })
  queues.set(name, queue)
  return queue
}

/**
 * Reset all cached queues and connection.
 * Intended for testing with mocked BullMQ/ioredis — does not close real connections.
 * For production graceful shutdown, use closeQueues() instead.
 */
export function resetQueues(): void {
  queues.clear()
  connection = undefined
}

/** Gracefully close all cached queues and the shared Redis connection */
export async function closeQueues(): Promise<void> {
  await Promise.all([...queues.values()].map(q => q.close()))
  queues.clear()
  if (connection) {
    connection.disconnect()
    connection = undefined
  }
}
