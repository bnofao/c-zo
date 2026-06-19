/**
 * Durable job queue concern — a thin typed wrapper over Effect's
 * `effect/unstable/persistence` `PersistedQueue`, backed by a SQL store
 * (`@effect/sql-pg`). Producers `offer` (deduped by id); a worker process
 * drains via `makeConsumer`. The store auto-creates its table and does
 * per-worker row locks, so multiple worker processes are safe.
 */
import type { Schema } from 'effect'
import type * as SqlClient from 'effect/unstable/sql/SqlClient'
import type { SqlError } from 'effect/unstable/sql/SqlError'
import { DatabaseConfig, DatabaseConfigFromEnv, makePgClientLayer } from '@czo/kit/db'
import { Effect, Layer } from 'effect'
import { PersistedQueue } from 'effect/unstable/persistence'

/**
 * Name of the SQL table the store owns (created at runtime, IF NOT EXISTS).
 * All queues share this single table with a globally-unique `id` namespace, so
 * offer ids must be unique across queues AND across occurrences of the same
 * logical job (e.g. include the deleted row's PK to differentiate cycles).
 */
export const JOB_QUEUE_TABLE = 'job_queue'

export interface QueueDef<S extends Schema.Top> {
  readonly name: string
  readonly schema: S
}

/** Declare a typed queue (shared by producer and consumer). */
export function defineQueue<S extends Schema.Top>(def: QueueDef<S>): QueueDef<S> {
  return def
}

/** Enqueue a job. `id` de-dups: offering the same id twice enqueues once. */
export function offer<S extends Schema.Top>(
  q: QueueDef<S>,
  value: S['Type'],
  options: { readonly id: string },
) {
  return PersistedQueue.make({ name: q.name, schema: q.schema }).pipe(
    Effect.flatMap(queue => queue.offer(value, options)),
  )
}

export interface QueueConsumer {
  readonly name: string
  /** Forever-drain loop; forked by the worker. */
  readonly run: Effect.Effect<never, never, any>
}

/**
 * Build a consumer: a forever loop that takes one job at a time and runs
 * `handler`. `take` SURFACES the handler error to the caller, so each take is
 * wrapped in `Effect.ignore` (logging first) — the loop survives a failing job
 * while the store requeues it; interruption still propagates for graceful
 * shutdown. (Do NOT use `catchCause` here — it would swallow interruption.)
 */
export function makeConsumer<S extends Schema.Top, R>(
  q: QueueDef<S>,
  handler: (value: S['Type'], meta: { readonly id: string, readonly attempts: number }) => Effect.Effect<void, unknown, R>,
  options?: { readonly maxAttempts?: number },
): QueueConsumer {
  const run = Effect.forever(
    PersistedQueue.make({ name: q.name, schema: q.schema }).pipe(
      Effect.flatMap(queue =>
        queue.take(handler, { maxAttempts: options?.maxAttempts ?? 10 }).pipe(
          Effect.tapCause(cause => Effect.logError(`queue ${q.name}: job failed`, cause)),
          Effect.ignore,
        ),
      ),
    ),
  ) as Effect.Effect<never, never, any>
  return { name: q.name, run }
}

/** SQL-backed `PersistedQueueFactory`. Requires a `SqlClient` in context. */
export const JobQueueLive: Layer.Layer<PersistedQueue.PersistedQueueFactory, SqlError, SqlClient.SqlClient>
  = PersistedQueue.layer.pipe(
    Layer.provide(PersistedQueue.layerStoreSql({ tableName: JOB_QUEUE_TABLE })),
  )

/** SqlClient from `DATABASE_URL`, sharing the canonical type-parser override. */
const SqlClientFromEnv = Layer.unwrap(
  Effect.gen(function* () {
    const cfg = yield* DatabaseConfig
    return makePgClientLayer(cfg.url)
  }),
).pipe(Layer.provide(DatabaseConfigFromEnv))

/** Self-contained factory (reads `DATABASE_URL`). Provide in API + worker. */
export const JobQueueLiveFromEnv: Layer.Layer<PersistedQueue.PersistedQueueFactory, never, never>
  = JobQueueLive.pipe(Layer.provide(SqlClientFromEnv)) as Layer.Layer<PersistedQueue.PersistedQueueFactory, never, never>
