import type { Processor, WorkerOptions } from 'bullmq'
import { Worker } from 'bullmq'
import { getQueueConnection } from './connection'

type CachedWorker = Worker<any, any, string>

const workers = new Map<string, CachedWorker>()

export async function useWorker<D = unknown, R = unknown, N extends string = string>(
  name: N,
  processor: Processor<D, R, N>,
  opts?: Omit<WorkerOptions, 'connection'>,
): Promise<Worker<D, R, N>> {
  const existing = workers.get(name)
  if (existing) {
    return existing as unknown as Worker<D, R, N>
  }

  const worker = new Worker<D, R, N>(name, processor, {
    ...opts,
    connection: await getQueueConnection(),
  })
  workers.set(name, worker as unknown as CachedWorker)
  return worker
}

/**
 * Reset all cached workers.
 * Intended for testing with mocked BullMQ — does not close real connections.
 * For production graceful shutdown, use closeWorkers() instead.
 */
export function resetWorkers(): void {
  workers.clear()
}

/** Gracefully close all cached workers */
export async function closeWorkers(): Promise<void> {
  await Promise.all([...workers.values()].map(w => w.close()))
  workers.clear()
}
