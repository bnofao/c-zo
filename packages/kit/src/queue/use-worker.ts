import type { Processor, WorkerOptions } from 'bullmq'
import { Worker } from 'bullmq'
import Redis from 'ioredis'
import { useCzoConfig } from '../config'

type CachedWorker = Worker<any, any, string>

const workers = new Map<string, CachedWorker>()
let connection: Redis | undefined

function getConnection(): Redis {
  if (!connection) {
    const { redisUrl } = useCzoConfig()
    if (!redisUrl) {
      throw new Error(
        'Redis URL is required for worker support. '
        + 'Set NITRO_CZO_REDIS_URL or configure runtimeConfig.czo.redisUrl',
      )
    }
    // maxRetriesPerRequest: null prevents ioredis from throwing
    // MaxRetriesPerRequestError during BullMQ blocking commands (BRPOPLPUSH)
    connection = new Redis(redisUrl, { maxRetriesPerRequest: null })
  }
  return connection
}

export function useWorker<D = unknown, R = unknown, N extends string = string>(
  name: N,
  processor: Processor<D, R, N>,
  opts?: Omit<WorkerOptions, 'connection'>,
): Worker<D, R, N> {
  const existing = workers.get(name)
  if (existing) {
    return existing as Worker<D, R, N>
  }

  const worker = new Worker<D, R, N>(name, processor, {
    ...opts,
    connection: getConnection(),
  })
  workers.set(name, worker)
  return worker
}

/**
 * Reset all cached workers and connection.
 * Intended for testing with mocked BullMQ/ioredis — does not close real connections.
 * For production graceful shutdown, use closeWorkers() instead.
 */
export function resetWorkers(): void {
  workers.clear()
  connection = undefined
}

/** Gracefully close all cached workers and the shared Redis connection */
export async function closeWorkers(): Promise<void> {
  await Promise.all([...workers.values()].map(w => w.close()))
  workers.clear()
  if (connection) {
    connection.disconnect()
    connection = undefined
  }
}
