import type { QueueOptions } from 'bullmq'
import { Queue } from 'bullmq'
import { getQueueConnection } from './connection'

type CachedQueue = Queue<any, any, string>

const queues = new Map<string, CachedQueue>()

export async function useQueue<D = unknown, R = unknown, N extends string = string>(
  name: N,
  opts?: Omit<QueueOptions, 'connection'>,
): Promise<Queue<D, R, N>> {
  const existing = queues.get(name)
  if (existing) {
    return existing as Queue<D, R, N>
  }

  const queue = new Queue<D, R, N>(name, {
    ...opts,
    connection: await getQueueConnection(),
  })
  queues.set(name, queue)
  return queue
}

/**
 * Reset all cached queues.
 * Intended for testing with mocked BullMQ — does not close real connections.
 * For production graceful shutdown, use closeQueues() instead.
 */
export function resetQueues(): void {
  queues.clear()
}

/** Gracefully close all cached queues */
export async function closeQueues(): Promise<void> {
  await Promise.all([...queues.values()].map(q => q.close()))
  queues.clear()
}
