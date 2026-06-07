import type { Database } from '@czo/kit/db'
import type { InferSelectModel } from 'drizzle-orm'
import type { Relations } from '../database/relations'
import type { inventoryItems, inventoryLevels, reservations } from '../database/schema'
import type { InventoryEvent } from './events/inventory'
import { DrizzleDb, OptimisticLockError, optimisticUpdate } from '@czo/kit/db'
import { StockLocation } from '@czo/stock-location/services'
import { and, eq, sql } from 'drizzle-orm'
import { Context, Data, Effect, Layer } from 'effect'
import { isSqlError } from 'effect/unstable/sql/SqlError'
import { inventoryItems as inventoryItemsTable, inventoryLevels as inventoryLevelsTable, reservations as reservationsTable } from '../database/schema'
import { InventoryEvents } from './events/inventory'

// ─── Tagged errors (also serve as Pothos GraphQL errors via registerError) ───

export class InventoryItemNotFound extends Data.TaggedError('InventoryItemNotFound') {
  readonly code = 'INVENTORY_ITEM_NOT_FOUND'
  get message() { return 'Inventory item not found' }
}

export class SkuTaken extends Data.TaggedError('SkuTaken')<{
  readonly sku: string
}> {
  readonly code = 'INVENTORY_SKU_TAKEN'
  get message() { return `Sku '${this.sku}' already exists in organization` }
}

export class InventoryDbFailed extends Data.TaggedError('InventoryDbFailed')<{
  readonly cause: unknown
}> {
  readonly code = 'INVENTORY_DB_FAILED'
  get message() { return 'Database operation failed' }
}

export class InventoryLevelNotFound extends Data.TaggedError('InventoryLevelNotFound') {
  readonly code = 'INVENTORY_LEVEL_NOT_FOUND'
  get message() { return 'Inventory level not found' }
}

export class LevelAlreadyExists extends Data.TaggedError('LevelAlreadyExists')<{
  readonly inventoryItemId: number
  readonly stockLocationId: number
}> {
  readonly code = 'INVENTORY_LEVEL_EXISTS'
  get message() { return 'A level for this item and location already exists' }
}

export class InsufficientStock extends Data.TaggedError('InsufficientStock') {
  readonly code = 'INVENTORY_INSUFFICIENT_STOCK'
  get message() { return 'Adjustment would push stocked below reserved or zero' }
}

export class CrossOrgStockLocation extends Data.TaggedError('CrossOrgStockLocation')<{
  readonly inventoryItemId: number
  readonly stockLocationId: number
}> {
  readonly code = 'INVENTORY_CROSS_ORG_STOCK_LOCATION'
  get message() { return 'Stock location belongs to a different organization' }
}

export class LevelHasReservations extends Data.TaggedError('LevelHasReservations') {
  readonly code = 'INVENTORY_LEVEL_HAS_RESERVATIONS'
  get message() { return 'Cannot delete a level with active reservations' }
}

export class InsufficientInventory extends Data.TaggedError('InsufficientInventory') {
  readonly code = 'INVENTORY_INSUFFICIENT_INVENTORY'
  get message() { return 'Not enough available inventory to reserve' }
}

export class ReservationNotFound extends Data.TaggedError('ReservationNotFound') {
  readonly code = 'INVENTORY_RESERVATION_NOT_FOUND'
  get message() { return 'Reservation not found' }
}

export type InventoryError
  = | InventoryItemNotFound
    | SkuTaken
    | InventoryDbFailed
    | OptimisticLockError
    | InventoryLevelNotFound
    | LevelAlreadyExists
    | InsufficientStock
    | CrossOrgStockLocation
    | LevelHasReservations
    | InsufficientInventory
    | ReservationNotFound

// ─── Input types ─────────────────────────────────────────────────────────────

export interface CreateReservationInput {
  inventoryItemId: number
  stockLocationId: number
  quantity: number
  lineItemId?: string | null
  description?: string | null
  createdBy?: number | null
  metadata?: Record<string, unknown> | null
}

export interface UpdateReservationInput {
  quantity?: number
  lineItemId?: string | null
  description?: string | null
  metadata?: Record<string, unknown> | null
}

export interface CreateLevelInput {
  stocked?: number
  incoming?: number
}

export interface SetLevelInput {
  stocked?: number
  incoming?: number
}

export interface CreateItemInput {
  organizationId: number
  sku: string
  title?: string | null
  description?: string | null
  requiresShipping?: boolean | null
  metadata?: Record<string, unknown> | null
}

export interface UpdateItemInput {
  sku?: string
  title?: string | null
  description?: string | null
  requiresShipping?: boolean
  metadata?: Record<string, unknown> | null
}

// ─── Domain model ────────────────────────────────────────────────────────────

export type InventoryItem = InferSelectModel<typeof inventoryItems>
export type InventoryLevel = InferSelectModel<typeof inventoryLevels>
export type Reservation = InferSelectModel<typeof reservations>

// ─── Pure helpers ─────────────────────────────────────────────────────────────

/** Extract Postgres SQLSTATE code from a (possibly nested) pg error. */
function isCheckViolation(cause: unknown): boolean {
  const code = (cause as { code?: string, cause?: { code?: string } })?.code
    ?? (cause as { cause?: { code?: string } })?.cause?.code
  return code === '23514'
}

// ─── Service contract (Effect Tag) ───────────────────────────────────────────

type FindFirstConfig = Parameters<Database<Relations>['query']['inventoryItems']['findFirst']>[0]
type FindManyConfig = Parameters<Database<Relations>['query']['inventoryItems']['findMany']>[0]
type FindFirstLevelConfig = Parameters<Database<Relations>['query']['inventoryLevels']['findFirst']>[0]
type FindFirstReservationConfig = Parameters<Database<Relations>['query']['reservations']['findFirst']>[0]

export class InventoryService extends Context.Service<
  InventoryService,
  {
    // ── Item reads ────────────────────────────────────────────────────────
    /**
     * Single-row read via Drizzle RQBv2. Accepts any `findFirst` config —
     * `{ where: { id } }`, `{ where: { organizationId, sku } }`, etc. Fails
     * with `InventoryItemNotFound` if no row matches. Soft-deleted rows are
     * implicitly excluded (`deletedAt: { isNull: true }` is merged in).
     */
    readonly findItem: (
      config?: FindFirstConfig,
    ) => Effect.Effect<InventoryItem, InventoryItemNotFound | InventoryDbFailed>

    /**
     * Multi-row read via Drizzle RQBv2. Soft-deleted rows are implicitly
     * excluded. Returns an empty array on no match (never fails with NotFound).
     */
    readonly findItems: (
      config?: FindManyConfig,
    ) => Effect.Effect<readonly InventoryItem[], InventoryDbFailed>

    // ── Item writes ───────────────────────────────────────────────────────
    // Authorization (org membership + permission) is enforced at the GraphQL
    // layer via the `permission` authScope — the service trusts its callers.
    readonly createItem: (
      input: CreateItemInput,
    ) => Effect.Effect<InventoryItem, SkuTaken | InventoryDbFailed>

    readonly updateItem: (
      id: number,
      expectedVersion: number,
      input: UpdateItemInput,
    ) => Effect.Effect<
      InventoryItem,
      InventoryItemNotFound | OptimisticLockError | InventoryDbFailed
    >

    readonly softDeleteItem: (
      id: number,
      expectedVersion: number,
    ) => Effect.Effect<
      InventoryItem,
      InventoryItemNotFound | OptimisticLockError | InventoryDbFailed
    >

    // ── Level reads ───────────────────────────────────────────────────────
    readonly findLevelById: (
      id: number,
    ) => Effect.Effect<InventoryLevel, InventoryLevelNotFound | InventoryDbFailed>

    // ── Reservation reads ─────────────────────────────────────────────────
    readonly findReservationById: (
      id: number,
    ) => Effect.Effect<Reservation, ReservationNotFound | InventoryDbFailed>

    // ── Level writes ──────────────────────────────────────────────────────
    readonly createLevel: (
      inventoryItemId: number,
      stockLocationId: number,
      input: CreateLevelInput,
    ) => Effect.Effect<
      InventoryLevel,
      InventoryItemNotFound | CrossOrgStockLocation | LevelAlreadyExists | InventoryDbFailed
    >

    readonly setLevel: (
      levelId: number,
      expectedVersion: number,
      input: SetLevelInput,
    ) => Effect.Effect<
      InventoryLevel,
      InventoryLevelNotFound | InsufficientStock | OptimisticLockError | InventoryDbFailed
    >

    /** Atomic SQL increment/decrement of stockedQuantity. Never negative, never below reservedQuantity. */
    readonly adjustStocked: (
      levelId: number,
      delta: number,
    ) => Effect.Effect<
      InventoryLevel,
      InventoryLevelNotFound | InsufficientStock | InventoryDbFailed
    >

    readonly deleteLevel: (
      levelId: number,
    ) => Effect.Effect<
      InventoryLevel,
      InventoryLevelNotFound | LevelHasReservations | InventoryDbFailed
    >

    // ── Reservation writes ────────────────────────────────────────────────
    readonly createReservation: (
      input: CreateReservationInput,
    ) => Effect.Effect<
      Reservation,
      InventoryLevelNotFound | InsufficientInventory | InventoryDbFailed
    >

    readonly updateReservation: (
      id: number,
      input: UpdateReservationInput,
    ) => Effect.Effect<
      Reservation,
      ReservationNotFound | InsufficientInventory | InventoryDbFailed
    >

    readonly deleteReservation: (
      id: number,
    ) => Effect.Effect<
      Reservation,
      ReservationNotFound | InventoryDbFailed
    >
  }
>()('@czo/inventory/InventoryService') {}

// ─── Layer ───────────────────────────────────────────────────────────────────

type InventoryServiceImpl = Context.Service.Shape<typeof InventoryService>

const make = Effect.gen(function* () {
  // The kit's DrizzleDb Tag exposes the bare `Database` type. We narrow to
  // `Database<Relations>` so RQBv2 query inference matches this module's
  // schema. Runtime client is the same — only the static type changes.
  const db = (yield* DrizzleDb) as Database<Relations>
  const events = yield* InventoryEvents
  const stockLocations = yield* StockLocation.StockLocationService

  /** Map any DB-layer error to InventoryDbFailed. */
  const dbErr = <A, E>(eff: Effect.Effect<A, E>) =>
    eff.pipe(Effect.mapError(cause => new InventoryDbFailed({ cause })))

  /**
   * Map a DB-layer error, but preserve `OptimisticLockError` as-is in the
   * error channel so the GraphQL layer can route it correctly.
   */
  const dbErrOptimistic = <A, E>(eff: Effect.Effect<A, E>) =>
    eff.pipe(
      Effect.mapError(e => e instanceof OptimisticLockError ? e : new InventoryDbFailed({ cause: e })),
    )

  /**
   * Map only genuine `SqlError` instances to `InventoryDbFailed`; all other
   * errors pass through untouched. Used for transactions that may fail with
   * domain errors (`InsufficientInventory`, `ReservationNotFound`, etc.) so
   * the tagged errors are not swallowed by a blanket `dbErr` call.
   */
  const dbErrSql = <A, E>(eff: Effect.Effect<A, E>): Effect.Effect<A, any> =>
    eff.pipe(Effect.mapError(e => isSqlError(e) ? new InventoryDbFailed({ cause: e }) : e))

  /** Publish a single domain event. PubSub.dropping never blocks. */
  const publish = (event: InventoryEvent) => events.publish(event)

  // `findItem` is a closure const so the authScope layer (and any future
  // internal caller) can reuse it. Typed once via
  // `InventoryServiceImpl['findItem']`; the other methods get contextual
  // typing from the `.of({...})` literal.
  const findItem: InventoryServiceImpl['findItem'] = config =>
    Effect.gen(function* () {
      const row = yield* dbErr(db.query.inventoryItems.findFirst({
        ...config,
        where: { ...config?.where, deletedAt: { isNull: true } },
      }))
      if (!row)
        return yield* Effect.fail(new InventoryItemNotFound())
      return row
    })

  // `findLevel` mirrors `findItem` for inventoryLevels.
  const findLevel = (config?: FindFirstLevelConfig) =>
    Effect.gen(function* () {
      const row = yield* dbErr(db.query.inventoryLevels.findFirst({
        ...config,
        where: { ...config?.where, deletedAt: { isNull: true } },
      }))
      if (!row)
        return yield* Effect.fail(new InventoryLevelNotFound())
      return row
    })

  // `findReservation` mirrors `findLevel` for reservations.
  const findReservation = (config?: FindFirstReservationConfig) =>
    Effect.gen(function* () {
      const row = yield* dbErr(db.query.reservations.findFirst({
        ...config,
        where: { ...config?.where, deletedAt: { isNull: true } },
      }))
      if (!row)
        return yield* Effect.fail(new ReservationNotFound())
      return row
    })

  return InventoryService.of({
    findItem,

    findItems: config =>
      dbErr(db.query.inventoryItems.findMany({
        ...config,
        where: { ...config?.where, deletedAt: { isNull: true } },
      })),

    createItem: input =>
      Effect.gen(function* () {
        // Pre-check for sku uniqueness within the org — the column has a
        // composite unique constraint but we check here for a cleaner error.
        // This is racy under concurrent inserts; the optimistic-lock window is
        // the GraphQL caller's responsibility.
        const existing = yield* dbErr(db.query.inventoryItems.findFirst({
          columns: { id: true },
          where: {
            organizationId: input.organizationId,
            sku: input.sku,
            deletedAt: { isNull: true },
          },
        }))
        if (existing)
          return yield* Effect.fail(new SkuTaken({ sku: input.sku }))

        const [created] = yield* dbErr(
          db
            .insert(inventoryItemsTable)
            .values({
              organizationId: input.organizationId,
              sku: input.sku,
              title: input.title ?? null,
              description: input.description ?? null,
              requiresShipping: input.requiresShipping ?? true,
              metadata: input.metadata ?? null,
            })
            .returning(),
        )

        yield* publish({
          _tag: 'InventoryItemCreated',
          id: created!.id,
          organizationId: created!.organizationId,
          sku: created!.sku,
        })

        return created!
      }),

    updateItem: (id, expectedVersion, input) =>
      Effect.gen(function* () {
        // Existence check — a missing row is a NotFound (404), distinct from the
        // version-mismatch OptimisticLockError that `optimisticUpdate` raises.
        yield* findItem({ where: { id } })

        const updated = yield* dbErrOptimistic(
          optimisticUpdate({ db, table: inventoryItemsTable, id, expectedVersion, values: input }),
        )

        yield* publish({
          _tag: 'InventoryItemUpdated',
          id,
          organizationId: updated.organizationId,
          changes: Object.keys(input),
        })

        return updated
      }),

    softDeleteItem: (id, expectedVersion) =>
      Effect.gen(function* () {
        // Existence check — a missing row is a NotFound (404), distinct from a
        // version-mismatch OptimisticLockError.
        yield* findItem({ where: { id } })

        const deleted = yield* dbErrOptimistic(
          optimisticUpdate({ db, table: inventoryItemsTable, id, expectedVersion, values: { deletedAt: sql`NOW()` as any } }),
        )

        yield* publish({
          _tag: 'InventoryItemDeleted',
          id,
          organizationId: deleted.organizationId,
          sku: deleted.sku,
        })

        return deleted
      }),

    findLevelById: id => findLevel({ where: { id } }),

    findReservationById: id => findReservation({ where: { id } }),

    createLevel: (inventoryItemId, stockLocationId, input) =>
      Effect.gen(function* () {
        const item = yield* findItem({ where: { id: inventoryItemId } })
        const sl = yield* stockLocations.findFirst({ where: { id: stockLocationId } }).pipe(
          Effect.catchTag('StockLocationNotFound', () => Effect.succeed(null)),
          Effect.mapError(cause => new InventoryDbFailed({ cause })),
        )
        if (!sl || sl.organizationId !== item.organizationId)
          return yield* Effect.fail(new CrossOrgStockLocation({ inventoryItemId, stockLocationId }))
        const existing = yield* dbErr(db.query.inventoryLevels.findFirst({
          columns: { id: true },
          where: { inventoryItemId, stockLocationId, deletedAt: { isNull: true } },
        }))
        if (existing)
          return yield* Effect.fail(new LevelAlreadyExists({ inventoryItemId, stockLocationId }))
        const [created] = yield* dbErr(db.insert(inventoryLevelsTable).values({
          organizationId: item.organizationId,
          inventoryItemId,
          stockLocationId,
          stockedQuantity: input.stocked ?? 0,
          incomingQuantity: input.incoming ?? 0,
        }).returning())
        yield* publish({
          _tag: 'InventoryLevelChanged',
          id: created!.id,
          organizationId: item.organizationId,
          inventoryItemId,
          stockLocationId,
        })
        return created!
      }),

    setLevel: (levelId, expectedVersion, input) =>
      Effect.gen(function* () {
        const lvl = yield* findLevel({ where: { id: levelId } })
        const updated = yield* dbErrOptimistic(
          optimisticUpdate({ db, table: inventoryLevelsTable, id: levelId, expectedVersion, values: {
            ...(input.stocked != null ? { stockedQuantity: input.stocked } : {}),
            ...(input.incoming != null ? { incomingQuantity: input.incoming } : {}),
          } }),
        ).pipe(
          Effect.catchTag('InventoryDbFailed', (e): Effect.Effect<never, InsufficientStock | InventoryDbFailed> =>
            isCheckViolation(e.cause) ? Effect.fail(new InsufficientStock()) : Effect.fail(e)),
        ) as Effect.Effect<InventoryLevel, InsufficientStock | InventoryDbFailed | OptimisticLockError>
        yield* publish({
          _tag: 'InventoryLevelChanged',
          id: levelId,
          organizationId: lvl.organizationId,
          inventoryItemId: lvl.inventoryItemId,
          stockLocationId: lvl.stockLocationId,
        })
        return updated
      }),

    adjustStocked: (levelId, delta) =>
      Effect.gen(function* () {
        const [row] = yield* dbErr(
          db.update(inventoryLevelsTable)
            .set({
              stockedQuantity: sql`${inventoryLevelsTable.stockedQuantity} + ${delta}`,
              version: sql`${inventoryLevelsTable.version} + 1`,
              updatedAt: sql`NOW()`,
            })
            .where(and(
              eq(inventoryLevelsTable.id, levelId),
              sql`${inventoryLevelsTable.deletedAt} IS NULL`,
              sql`${inventoryLevelsTable.stockedQuantity} + ${delta} >= ${inventoryLevelsTable.reservedQuantity}`,
              sql`${inventoryLevelsTable.stockedQuantity} + ${delta} >= 0`,
            ))
            .returning(),
        )
        if (row) {
          yield* publish({ _tag: 'InventoryLevelChanged', id: row.id, organizationId: row.organizationId, inventoryItemId: row.inventoryItemId, stockLocationId: row.stockLocationId })
          return row
        }
        const exists = yield* dbErr(db.query.inventoryLevels.findFirst({
          columns: { id: true },
          where: { id: levelId, deletedAt: { isNull: true } },
        }))
        return yield* Effect.fail(exists ? new InsufficientStock() : new InventoryLevelNotFound())
      }),

    deleteLevel: levelId =>
      Effect.gen(function* () {
        const lvl = yield* findLevel({ where: { id: levelId } })
        if (lvl.reservedQuantity > 0)
          return yield* Effect.fail(new LevelHasReservations())
        yield* dbErr(
          db.update(inventoryLevelsTable)
            .set({ deletedAt: sql`NOW()` })
            .where(eq(inventoryLevelsTable.id, levelId)),
        )
        yield* publish({
          _tag: 'InventoryLevelChanged',
          id: levelId,
          organizationId: lvl.organizationId,
          inventoryItemId: lvl.inventoryItemId,
          stockLocationId: lvl.stockLocationId,
        })
        return { ...lvl, deletedAt: new Date() }
      }),

    createReservation: input =>
      Effect.gen(function* () {
        const lvl = yield* findLevel({ where: { inventoryItemId: input.inventoryItemId, stockLocationId: input.stockLocationId } })
        const res = yield* dbErrSql(db.transaction(tx => Effect.gen(function* () {
          const [bumped] = yield* tx.update(inventoryLevelsTable)
            .set({ reservedQuantity: sql`${inventoryLevelsTable.reservedQuantity} + ${input.quantity}`, updatedAt: sql`NOW()` })
            .where(and(
              eq(inventoryLevelsTable.id, lvl.id),
              sql`${inventoryLevelsTable.stockedQuantity} - ${inventoryLevelsTable.reservedQuantity} >= ${input.quantity}`,
            ))
            .returning({ id: inventoryLevelsTable.id })
          if (!bumped)
            return yield* Effect.fail(new InsufficientInventory())
          const [created] = yield* tx.insert(reservationsTable).values({
            organizationId: lvl.organizationId,
            inventoryItemId: input.inventoryItemId,
            stockLocationId: input.stockLocationId,
            quantity: input.quantity,
            lineItemId: input.lineItemId ?? null,
            description: input.description ?? null,
            createdBy: input.createdBy ?? null,
            metadata: input.metadata ?? null,
          }).returning()
          return created!
        })))
        yield* publish({ _tag: 'ReservationCreated', id: res.id, organizationId: res.organizationId, inventoryItemId: res.inventoryItemId, quantity: res.quantity })
        return res
      }),

    updateReservation: (id, input) =>
      Effect.gen(function* () {
        return yield* dbErrSql(db.transaction(tx => Effect.gen(function* () {
          const res = yield* tx.query.reservations.findFirst({ where: { id, deletedAt: { isNull: true } } })
          if (!res)
            return yield* Effect.fail(new ReservationNotFound())
          if (input.quantity != null && input.quantity !== res.quantity) {
            const delta = input.quantity - res.quantity
            const [bumped] = yield* tx.update(inventoryLevelsTable)
              .set({ reservedQuantity: sql`${inventoryLevelsTable.reservedQuantity} + ${delta}`, updatedAt: sql`NOW()` })
              .where(and(
                eq(inventoryLevelsTable.inventoryItemId, res.inventoryItemId),
                eq(inventoryLevelsTable.stockLocationId, res.stockLocationId),
                sql`${inventoryLevelsTable.deletedAt} IS NULL`,
                sql`${inventoryLevelsTable.stockedQuantity} - ${inventoryLevelsTable.reservedQuantity} >= ${delta}`,
              ))
              .returning({ id: inventoryLevelsTable.id })
            if (!bumped)
              return yield* Effect.fail(new InsufficientInventory())
          }
          const [updated] = yield* tx.update(reservationsTable).set({
            ...(input.quantity != null ? { quantity: input.quantity } : {}),
            ...(input.lineItemId !== undefined ? { lineItemId: input.lineItemId } : {}),
            ...(input.description !== undefined ? { description: input.description } : {}),
            ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
            updatedAt: sql`NOW()`,
          }).where(eq(reservationsTable.id, id)).returning()
          return updated!
        })))
      }),

    deleteReservation: id =>
      Effect.gen(function* () {
        const res = yield* dbErrSql(db.transaction(tx => Effect.gen(function* () {
          const r = yield* tx.query.reservations.findFirst({ where: { id, deletedAt: { isNull: true } } })
          if (!r)
            return yield* Effect.fail(new ReservationNotFound())
          // Decrement reserved on the matching live level (by item×location — a
          // reservation always targets the level that passed createLevel's
          // guard). Safe because `deleteLevel` refuses while reserved > 0, so a
          // level with live reservations is never soft-deleted out from under us.
          yield* tx.update(inventoryLevelsTable)
            .set({ reservedQuantity: sql`${inventoryLevelsTable.reservedQuantity} - ${r.quantity}`, updatedAt: sql`NOW()` })
            .where(and(eq(inventoryLevelsTable.inventoryItemId, r.inventoryItemId), eq(inventoryLevelsTable.stockLocationId, r.stockLocationId), sql`${inventoryLevelsTable.deletedAt} IS NULL`))
          yield* tx.update(reservationsTable).set({ deletedAt: sql`NOW()` }).where(eq(reservationsTable.id, id))
          return r
        })))
        yield* publish({ _tag: 'ReservationReleased', id: res.id, organizationId: res.organizationId, inventoryItemId: res.inventoryItemId, quantity: res.quantity })
        return res
      }),
  } satisfies InventoryServiceImpl)
})

/** Live layer. */
export const layer = Layer.effect(InventoryService, make)
