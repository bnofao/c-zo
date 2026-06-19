import { PgClient } from '@effect/sql-pg'
import { PostgreSqlContainer } from '@testcontainers/postgresql'
import { Effect, Fiber, Layer, Redacted, Schema } from 'effect'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { defineQueue, JobQueueLive, makeConsumer, offer } from './index'

const Job = Schema.Struct({ productId: Schema.Number, orgId: Schema.Number })
const Q = defineQueue({ name: 'kit-queue-spike', schema: Job })

let container: Awaited<ReturnType<PostgreSqlContainer['start']>>
let factory: Layer.Layer<any, any, never>

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:17').start()
  const url = Redacted.make(container.getConnectionUri())
  factory = JobQueueLive.pipe(Layer.provide(PgClient.layer({ url })))
}, 120_000)

afterAll(async () => {
  await container?.stop()
})

it('durable across runtimes, dedup by id, retry on failure', async () => {
  // Producer runtime — offer, then tear the scope down.
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        yield* offer(Q, { productId: 1, orgId: 7 }, { id: 'j:1:7' })
        yield* offer(Q, { productId: 1, orgId: 7 }, { id: 'j:1:7' }) // dup -> ignored
        yield* offer(Q, { productId: 99, orgId: 7 }, { id: 'j:99:7' }) // retry probe
      }).pipe(Effect.provide(factory)),
    ),
  )

  // Fresh consumer runtime over the SAME container.
  const seen: Array<{ productId: number, orgId: number, attempts: number }> = []
  const consumer = makeConsumer(
    Q,
    (job, meta) =>
      job.productId === 99 && meta.attempts < 2
        ? Effect.fail(new Error('boom'))
        : Effect.sync(() => { seen.push({ ...job, attempts: meta.attempts }) }),
    { maxAttempts: 3 },
  )
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkScoped(consumer.run)
        yield* Effect.sleep('4 seconds')
        yield* Fiber.interrupt(fiber)
      }).pipe(Effect.provide(factory)),
    ),
  )

  const ids = seen.map(s => s.productId).sort((a, b) => a - b)
  expect(ids).toContain(1)
  expect(ids).toContain(99)
  expect(seen.filter(s => s.productId === 1)).toHaveLength(1) // dedup
  expect(seen.find(s => s.productId === 99)!.attempts).toBeGreaterThanOrEqual(2) // retry
}, 60_000)
