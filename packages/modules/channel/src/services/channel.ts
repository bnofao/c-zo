import type { Database } from '@czo/kit/db'
import type { InferSelectModel } from 'drizzle-orm'
import type { Relations } from '../database/relations'
import type { channels } from '../database/schema'
import type { ChannelEvent } from './events/channel'
import { DrizzleDb, OptimisticLockError, optimisticUpdate } from '@czo/kit/db'
import { StockLocation } from '@czo/stock-location/services'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { Context, Data, Effect, Layer } from 'effect'
import { channels as channelsTable, channelStockLocations } from '../database/schema'
import { ChannelEvents } from './events/channel'

// ─── Tagged errors (also serve as Pothos GraphQL errors via registerError) ───

export class ChannelNotFound extends Data.TaggedError('ChannelNotFound') {
  readonly code = 'CHANNEL_NOT_FOUND'
  get message() { return 'Channel not found' }
}

export class ChannelHandleTaken extends Data.TaggedError('ChannelHandleTaken')<{
  readonly handle: string
}> {
  readonly code = 'CHANNEL_HANDLE_TAKEN'
  get message() { return `Handle '${this.handle}' already exists in organization` }
}

export class ChannelDbFailed extends Data.TaggedError('ChannelDbFailed')<{
  readonly cause: unknown
}> {
  readonly code = 'CHANNEL_DB_FAILED'
  get message() { return 'Database operation failed' }
}

export class CrossOrgStockLocation extends Data.TaggedError('CrossOrgStockLocation')<{
  readonly channelId: number
  readonly stockLocationId: number
}> {
  readonly code = 'CROSS_ORG_STOCK_LOCATION'
  get message() { return `Stock location ${this.stockLocationId} is not in channel ${this.channelId}'s organization` }
}

export type ChannelError
  = | ChannelNotFound
    | ChannelHandleTaken
    | ChannelDbFailed
    | CrossOrgStockLocation
    | OptimisticLockError

// ─── Input types ─────────────────────────────────────────────────────────────

export interface CreateChannelInput {
  organizationId: number | null
  name: string
  handle: string
  description?: string | null
  isDefault?: boolean | null
  isActive?: boolean | null
  metadata?: Record<string, unknown> | null
}

export interface UpdateChannelInput {
  name?: string
  handle?: string
  description?: string | null
  isActive?: boolean
  isDefault?: boolean
  metadata?: Record<string, unknown> | null
}

// ─── Pure helper (no DB access) ──────────────────────────────────────────────

export function generateHandle(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
}

// ─── Domain model ────────────────────────────────────────────────────────────

export type Channel = InferSelectModel<typeof channels>

// ─── Service contract (Effect Tag) ───────────────────────────────────────────

type FindFirstConfig = Parameters<Database<Relations>['query']['channels']['findFirst']>[0]
type FindManyConfig = Parameters<Database<Relations>['query']['channels']['findMany']>[0]

export class ChannelService extends Context.Service<
  ChannelService,
  {
    // ── Reads ─────────────────────────────────────────────────────────────
    /**
     * Single-row read via Drizzle RQBv2. Accepts any `findFirst` config —
     * `{ where: { id } }`, `{ where: { organizationId, handle } }`, etc. Fails
     * with `ChannelNotFound` if no row matches. Soft-deleted rows are
     * implicitly excluded (`deletedAt: { isNull: true }` is merged in).
     */
    readonly findFirst: (
      config?: FindFirstConfig,
    ) => Effect.Effect<Channel, ChannelNotFound | ChannelDbFailed>

    /**
     * Multi-row read via Drizzle RQBv2. Soft-deleted rows are implicitly
     * excluded. Returns an empty array on no match (never fails with NotFound).
     */
    readonly findMany: (
      config?: FindManyConfig,
    ) => Effect.Effect<readonly Channel[], ChannelDbFailed>

    // ── Writes ────────────────────────────────────────────────────────────
    // Authorization (org membership + permission) is enforced at the GraphQL
    // layer via the `permission` authScope — the service trusts its callers.
    readonly create: (
      input: CreateChannelInput,
    ) => Effect.Effect<Channel, ChannelHandleTaken | ChannelDbFailed>

    readonly update: (
      id: number,
      expectedVersion: number,
      input: UpdateChannelInput,
    ) => Effect.Effect<
      Channel,
      ChannelNotFound | OptimisticLockError | ChannelDbFailed
    >

    readonly softDelete: (
      id: number,
      expectedVersion: number,
    ) => Effect.Effect<
      Channel,
      ChannelNotFound | OptimisticLockError | ChannelDbFailed
    >

    readonly addStockLocations: (
      channelId: number,
      stockLocationIds: ReadonlyArray<number>,
    ) => Effect.Effect<readonly number[], ChannelNotFound | CrossOrgStockLocation | ChannelDbFailed>

    readonly removeStockLocations: (
      channelId: number,
      stockLocationIds: ReadonlyArray<number>,
    ) => Effect.Effect<readonly number[], ChannelNotFound | ChannelDbFailed>
  }
>()('@czo/channel/ChannelService') {}

// ─── Layer ───────────────────────────────────────────────────────────────────

type ChannelServiceImpl = Context.Service.Shape<typeof ChannelService>

const make = Effect.gen(function* () {
  // The kit's DrizzleDb Tag exposes the bare `Database` type. We narrow to
  // `Database<Relations>` so RQBv2 query inference matches this module's
  // schema. Runtime client is the same — only the static type changes.
  const db = (yield* DrizzleDb) as Database<Relations>
  const events = yield* ChannelEvents
  const stockLocations = yield* StockLocation.StockLocationService

  /** Map any DB-layer error to ChannelDbFailed. */
  const dbErr = <A, E>(eff: Effect.Effect<A, E>) =>
    eff.pipe(Effect.mapError(cause => new ChannelDbFailed({ cause })))

  /**
   * Map a DB-layer error, but preserve `OptimisticLockError` as-is in the
   * error channel so the GraphQL layer can route it correctly.
   */
  const dbErrOptimistic = <A, E>(eff: Effect.Effect<A, E>) =>
    eff.pipe(
      Effect.mapError(e => e instanceof OptimisticLockError ? e : new ChannelDbFailed({ cause: e })),
    )

  /** Publish a single domain event. PubSub.dropping never blocks. */
  const publish = (event: ChannelEvent) => events.publish(event)

  // `findFirst` is a closure const so the authScope layer (and any future
  // internal caller) can reuse it. Typed once via
  // `ChannelServiceImpl['findFirst']`; the other methods get contextual
  // typing from the `.of({...})` literal.
  const findFirst: ChannelServiceImpl['findFirst'] = config =>
    Effect.gen(function* () {
      const row = yield* dbErr(db.query.channels.findFirst({
        ...config,
        where: { ...config?.where, deletedAt: { isNull: true } },
      }))
      if (!row)
        return yield* Effect.fail(new ChannelNotFound())
      return row
    })

  return ChannelService.of({
    findFirst,

    findMany: config =>
      dbErr(db.query.channels.findMany({
        ...config,
        where: { ...config?.where, deletedAt: { isNull: true } },
      })),

    create: input =>
      Effect.gen(function* () {
        // Pre-check for handle uniqueness within the org — the column has a
        // composite unique constraint but we check here for a cleaner error.
        // This is racy under concurrent inserts; the optimistic-lock window is
        // the GraphQL caller's responsibility.
        const existing = yield* dbErr(db.query.channels.findFirst({
          columns: { id: true },
          where: {
            organizationId: input.organizationId === null ? { isNull: true } : input.organizationId,
            handle: input.handle,
            deletedAt: { isNull: true },
          },
        }))
        if (existing)
          return yield* Effect.fail(new ChannelHandleTaken({ handle: input.handle }))

        const [created] = yield* dbErr(
          db
            .insert(channelsTable)
            .values({
              organizationId: input.organizationId,
              name: input.name,
              handle: input.handle,
              description: input.description ?? null,
              isDefault: input.isDefault ?? false,
              isActive: input.isActive ?? true,
              metadata: input.metadata ?? null,
            })
            .returning(),
        )

        yield* publish({
          _tag: 'ChannelCreated',
          id: created!.id,
          organizationId: created!.organizationId,
          handle: created!.handle,
          name: created!.name,
        })

        return created!
      }),

    update: (id, expectedVersion, input) =>
      Effect.gen(function* () {
        // Existence check — a missing row is a NotFound (404), distinct from the
        // version-mismatch OptimisticLockError that `optimisticUpdate` raises.
        yield* findFirst({ where: { id } })

        const updated = yield* dbErrOptimistic(
          optimisticUpdate({ db, table: channelsTable, id, expectedVersion, values: input }),
        )

        yield* publish({
          _tag: 'ChannelUpdated',
          id,
          organizationId: updated.organizationId,
          changes: Object.keys(input),
        })

        return updated
      }),

    softDelete: (id, expectedVersion) =>
      Effect.gen(function* () {
        // Existence check — a missing row is a NotFound (404), distinct from a
        // version-mismatch OptimisticLockError.
        yield* findFirst({ where: { id } })

        const deleted = yield* dbErrOptimistic(
          optimisticUpdate({ db, table: channelsTable, id, expectedVersion, values: { deletedAt: sql`NOW()` as any } }),
        )

        yield* publish({
          _tag: 'ChannelDeleted',
          id,
          organizationId: deleted.organizationId,
          handle: deleted.handle,
        })

        return deleted
      }),
    addStockLocations: (channelId, stockLocationIds) =>
      Effect.gen(function* () {
        const channel = yield* findFirst({ where: { id: channelId } })
        if (stockLocationIds.length === 0)
          return []
        for (const slId of stockLocationIds) {
          const sl = yield* stockLocations.findFirst({ where: { id: slId } }).pipe(
            Effect.catchTag('StockLocationNotFound', () => Effect.succeed(null)),
            Effect.mapError(cause => new ChannelDbFailed({ cause })),
          )
          if (!sl || sl.organizationId !== channel.organizationId)
            return yield* Effect.fail(new CrossOrgStockLocation({ channelId, stockLocationId: slId }))
        }
        yield* dbErr(db.insert(channelStockLocations)
          .values(stockLocationIds.map(stockLocationId => ({ channelId, stockLocationId })))
          .onConflictDoNothing())
        yield* publish({
          _tag: 'ChannelStockLocationsChanged',
          id: channelId,
          organizationId: channel.organizationId,
          added: [...stockLocationIds],
          removed: [],
        })
        return [...stockLocationIds]
      }),

    removeStockLocations: (channelId, stockLocationIds) =>
      Effect.gen(function* () {
        const channel = yield* findFirst({ where: { id: channelId } })
        if (stockLocationIds.length === 0)
          return []
        yield* dbErr(db.delete(channelStockLocations).where(and(
          eq(channelStockLocations.channelId, channelId),
          inArray(channelStockLocations.stockLocationId, [...stockLocationIds]),
        )))
        yield* publish({
          _tag: 'ChannelStockLocationsChanged',
          id: channelId,
          organizationId: channel.organizationId,
          added: [],
          removed: [...stockLocationIds],
        })
        return [...stockLocationIds]
      }),
  } satisfies ChannelServiceImpl)
})

/** Live layer. */
export const layer = Layer.effect(ChannelService, make)
