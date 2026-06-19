# Durable job queue (`@czo/kit/queue`) + worker process + hybrid un-adopt — design

**Date:** 2026-06-17
**Status:** Approved — ready for implementation plan
**Area:** `@czo/kit` (new `queue` concern + `buildRuntime`), `apps/life` (worker entrypoint), `@czo/product` (first consumer)

## Goal

Give c-zo a **durable, retried, idempotent background job queue** built on Effect's own
`effect/unstable/persistence` `PersistedQueue` (SQL-backed via `@effect/sql-pg`), drained by a
**separate worker process** in `apps/life`. First consumer: defer the heavy part of the un-adopt
graft purge off the request path, while keeping storefront-visible cleanup synchronous.

## Background & decisions

`AdoptionService.unadoptProduct` hard-deletes the adoption row, then runs three graft purges inline
(attribute, price/inventory, media/channel). The purges are fast scoped deletes today, but the
question "should this be deferred to a queue?" surfaced a set of decisions, all now made:

- **Durability is achievable on the existing stack.** A spike proved `PersistedQueue` +
  `PersistedQueue.layerStoreSql()` works end-to-end over `@effect/sql-pg`'s `SqlClient`: durable
  across separate runtimes (producer scope torn down, fresh consumer drains the same DB), dedup by
  `offer` id, and automatic requeue/retry. See "Spike evidence".
- **Consistency window → HYBRID.** Deferring everything would leave a window where the adoption row
  is gone but grafts linger — critically, **channel listings keep the product live/purchasable on
  the org storefront**. Decision: purge channel/media grafts (and the adoption row) **synchronously**
  so the product leaves the storefront immediately; **defer** the heavier, storefront-invisible
  grafts (attribute pivots + scalar values, price/inventory) to the queue.
- **Worker is a SEPARATE process** (a `life worker` command), not an in-process daemon. The SQL
  store does per-worker row locks, so N worker processes are safe.
- **Module-level consumer registry.** Modules expose consumers via a `queues?` field on
  `defineModule` (same "module contributes X" pattern as openapi `routes` / `nodeGuards`); the worker
  aggregates them.
- **The library owns its queue table** (runtime-created, idempotent), outside the domain drizzle
  migrations by design.

This design is a **foundation** (`@czo/kit/queue` reusable by any module) with un-adopt as its first
consumer — useful well beyond adoption.

## Architecture

```
 API process (apps/life main.ts)              Worker process (apps/life worker.ts)
 ┌───────────────────────────────┐            ┌───────────────────────────────────┐
 │ unadoptProduct:               │  Postgres  │ buildRuntime(modules) + JobQueueLive│
 │  • DELETE adoption row        │  ┌───────┐ │ for each module.queues:             │
 │  • purge channel/media (sync) │  │ job_  │ │   forkScoped(consumer.run)          │
 │  • queue.offer(unadopt job) ──┼─▶│ queue │◀┼── take(handler) → purgeDeferred     │
 └───────────────────────────────┘  │ table │ │   (attribute + price/inventory)     │
       (producer only)              └───────┘ └───────────────────────────────────┘
                                   per-worker row locks → N workers safe
```

### A. `@czo/kit/queue` concern (new)

A thin, typed wrapper over `effect/unstable/persistence`. Minimal surface:

```ts
// Queue definition (name + payload schema). Shared by producer and consumer.
export interface QueueDef<S extends Schema.Top> { readonly name: string; readonly schema: S }
export const defineQueue = <S extends Schema.Top>(def: QueueDef<S>): QueueDef<S> => def

// Producer: resolve the Factory and enqueue. `id` de-dups (same id ⇒ not re-enqueued).
export const offer = <S extends Schema.Top>(
  q: QueueDef<S>, value: S['Type'], options: { readonly id: string },
) => Effect.flatMap(
  PersistedQueue.make({ name: q.name, schema: q.schema }),
  queue => queue.offer(value, options),
)

// Consumer descriptor a module exposes. `run` is the forever-drain loop.
export interface QueueConsumer { readonly name: string; readonly run: Effect.Effect<never, never, DrizzleDb | SqlClient.SqlClient> }
export const makeConsumer = <S extends Schema.Top, R>(
  q: QueueDef<S>,
  handler: (value: S['Type'], meta: { id: string, attempts: number }) => Effect.Effect<void, unknown, R>,
  options?: { readonly maxAttempts?: number },
): QueueConsumer => /* see "loop stays alive" below */

// SQL-backed factory layer (PersistedQueue.layer over layerStoreSql), wired to the app SqlClient.
export const JobQueueLive: Layer.Layer<PersistedQueueFactory, SqlError, SqlClient.SqlClient>
```

**Loop-stays-alive (spike finding).** `queue.take(handler)` *surfaces the handler's error to the
caller*, so a naive `Effect.forever(queue.take(handler))` dies on the first failing job. `makeConsumer`
wraps each take so the loop survives while the store independently requeues the failed row:

```ts
run: Effect.forever(
  Effect.flatMap(PersistedQueue.make(q), queue =>
    queue.take(handler, { maxAttempts: options?.maxAttempts ?? 10 }).pipe(
      Effect.tapErrorCause(cause => Effect.logError(`queue ${q.name}: job failed`, cause)),
      Effect.ignore, // swallow failure/defect so the loop continues; the store requeues the row
    )),
)
```

**Graceful shutdown caveat (spike-proven).** Use `Effect.ignore` (which lets **interruption
propagate**), NOT `Effect.catchCause`/`catchAllCause` — those would catch the `Fiber.interrupt`
cause and prevent the worker from stopping on SIGTERM. The spike confirmed `Effect.ignore` swallows
job failure/defects while interruption still tears the loop down. The exact logging combinator is
finalized in the plan.

### B. `buildRuntime` (extract from `buildApp`)

`buildApp` today composes module layers (deps-first `provideMerge` fold) **and** mounts HTTP. Extract
the layer-composition core into `buildRuntime({ modules, services })` returning the composed
`{ modules, layer }`. `buildApp` becomes `buildRuntime` + HTTP mount — **no behavior change to
`main.ts`**. The worker uses `buildRuntime` to get the same DB/services context without yoga.

### C. `defineModule` gains `queues?`

```ts
defineModule({ name, version, layer, queues?: QueueConsumer[] })
```

Aggregated by the worker exactly like `routes`/`nodeGuards`. Producers (services in the API process)
just call `kit/queue`'s `offer` — they need only `JobQueueLive`, which is added to the shared module
runtime so both processes can construct queues.

### D. Worker entrypoint (`apps/life/src/worker.ts`)

```ts
const { modules, layer } = buildRuntime({ modules: appModules, services: Email.fromEnv })
const consumers = modules.flatMap(m => m.queues ?? [])
const program = Effect.forEach(consumers, c => Effect.forkScoped(c.run), { discard: true }).pipe(
  Effect.andThen(Effect.never), // keep the process alive; forked consumers drain
  Effect.scoped,
  Effect.provide(Layer.mergeAll(layer, JobQueueLive)),
)
NodeRuntime.runMain(program) // SIGTERM → interrupt → scoped take releases its row lock
```

Script: `"worker": "node --import ./src/register-otel.mjs --import tsx src/worker.ts"`.

## Hybrid un-adopt (first consumer, in `@czo/product`)

1. **Extract** `purgeOrgAttributeGrafts` / `purgeOrgPriceInventoryGrafts` / `purgeOrgMediaChannelGrafts`
   out of the `AdoptionService.make` closure into a standalone `src/services/graft-purge.ts`
   (functions/service over `DrizzleDb`), callable by both the sync path and the consumer.
2. **`unadoptProduct` (synchronous, request path):** hard-delete the adoption row +
   `purgeOrgMediaChannelGrafts(productId, orgId)` (carries the storefront-critical channel listings;
   media is small and bundled) → the product leaves the storefront immediately. Then enqueue:
   `kit/queue.offer(UnadoptCleanupQueue, { productId, orgId }, { id: \`unadopt:${productId}:${orgId}\` })`.
3. **Consumer (`product` module `queues`):** `makeConsumer(UnadoptCleanupQueue, purgeDeferred)` where
   `purgeDeferred(productId, orgId) = purgeOrgAttributeGrafts(...) *> purgeOrgPriceInventoryGrafts(...)`.
   Both are idempotent scoped deletes ⇒ retry-safe.

```ts
const UnadoptCleanup = Schema.Struct({ productId: Schema.Number, orgId: Schema.Number })
export const UnadoptCleanupQueue = defineQueue({ name: 'product:unadopt-cleanup', schema: UnadoptCleanup })
```

## Queue table provisioning

`PersistedQueue.layerStoreSql({ tableName })` **creates its own table + indexes at runtime**. It lives
**outside** the domain drizzle migrations *by design*: its shape is a library-internal detail that can
change across Effect betas, so hand-tracking it in a migration is fragile. The plan will confirm the
create is `IF NOT EXISTS` (idempotent) so concurrent workers/boot are race-safe, and pin `tableName`
via kit config.

## Errors, retry, dead-letter

- `maxAttempts` configurable (default 10). On exhaustion the SQL store **auto-moves the item to a
  failed queue** (built-in dead-letter). The consumer logs each failure and exhaustion via the kit
  structured logger.
- A dead-letter inspection/replay CLI is **out of scope** for v1 (rely on the failed-queue + logs).

## Configuration / ops

- The worker process needs the same `DATABASE_URL` as the API. New tunables — queue `tableName`,
  default `maxAttempts`, store `pollInterval` — go in the kit config block (no scattered constants).
- **Dev:** run API + worker together (a combined `dev` script or two terminals). Documented in the
  app README.
- **Deploy:** two deployables (web + worker) from the same image, different entrypoints.

## Testing

- **kit/queue (integration):** promote the spike to a real test — durable across runtimes, dedup by
  id, retry/requeue over `layerStoreSql` on a Testcontainers Postgres.
- **un-adopt (integration, `@czo/product`):** the consumer handler is the directly-callable
  `purgeDeferred(productId, orgId)` effect, so tests need **no worker process**:
  1. after `unadoptProduct`: adoption row gone **and** channel/media grafts gone (sync invariant);
  2. a job was enqueued (assert via the queue, or assert `offer` was called);
  3. attribute + price/inventory grafts removed **after** calling `purgeDeferred` directly.
- **e2e (`product-org`, `channel-grafts`):** assert the **sync** invariant — un-adopt removes the
  product from the storefront immediately. Deferred cleanup is covered by the consumer unit test
  (e2e does not run the worker process).

## Phasing (for the plan)

- **Phase 1 — foundation (independently shippable):** `@czo/kit/queue` concern + `JobQueueLive` +
  `buildRuntime` extraction + `defineModule.queues` + `apps/life` `worker.ts` + `worker` script +
  kit integration test (promoted spike). No consumer yet (worker starts, drains nothing).
- **Phase 2 — first consumer:** extract `graft-purge.ts`; hybrid `unadoptProduct`; `UnadoptCleanupQueue`
  + product `queues` consumer; update adoption tests to the hybrid/sync-invariant model.

## Out of scope / future

- Dead-letter inspection/replay tooling.
- Scheduling/cron-style jobs, delayed jobs, priorities.
- Multiple queues per module beyond the one needed; a generic admin view of queue depth.
- Migrating other inline cleanups (none today) onto the queue — done opportunistically later.

## Spike evidence (validated 2026-06-17)

A throwaway `kit` integration test against a real Postgres proved, in one run:
`PgClient.layer` (provides `SqlClient`) → `layerStoreSql()` (auto-creates its table) →
`PersistedQueue.layer` → `make`/`offer`/`take`:

- **Durable across separate runtimes** — jobs offered in a torn-down producer runtime were drained by
  a fresh consumer runtime over the same DB (≈ producer process / worker process).
- **Dedup** — same `offer` id twice ⇒ processed once.
- **Retry** — a handler that failed its first attempt was requeued and succeeded on attempt 2.
- **Ergonomic finding** — `take` surfaces the handler error to the caller; the worker loop must catch
  it (`Effect.ignore`/`catchCause`) to stay alive while the store requeues. (`Effect.catchAllCause`
  does not exist in Effect 4 — use `catchCause`/`ignore`.)
