import type { Database } from '@czo/kit/db'
import type { InferSelectModel } from 'drizzle-orm'
import type { Relations } from '../database/relations'
import type { stockLocations } from '../database/schema'
import type { StockLocationEvent } from './events/stock-location'
import { DrizzleDb, OptimisticLockError, optimisticUpdate } from '@czo/kit/db'
import { and, eq, sql } from 'drizzle-orm'
import { Context, Data, Effect, Layer } from 'effect'
import { stockLocationAddresses, stockLocations as stockLocationsTable } from '../database/schema'
import { StockLocationEvents } from './events/stock-location'

// ─── Tagged errors (also serve as Pothos GraphQL errors via registerError) ───

export class StockLocationNotFound extends Data.TaggedError('StockLocationNotFound') {
  readonly code = 'STOCK_LOCATION_NOT_FOUND'
  get message() { return 'Stock location not found' }
}

export class HandleTaken extends Data.TaggedError('HandleTaken')<{
  readonly handle: string
}> {
  readonly code = 'STOCK_LOCATION_HANDLE_TAKEN'
  get message() { return `Handle '${this.handle}' already exists in organization` }
}

export class StockLocationDbFailed extends Data.TaggedError('StockLocationDbFailed')<{
  readonly cause: unknown
}> {
  readonly code = 'STOCK_LOCATION_DB_FAILED'
  get message() { return 'Database operation failed' }
}

export type StockLocationError
  = | StockLocationNotFound
    | HandleTaken
    | StockLocationDbFailed
    | OptimisticLockError

// ─── Input types ─────────────────────────────────────────────────────────────

export interface CreateStockLocationAddressInput {
  addressLine1: string
  addressLine2?: string | null
  city: string
  province?: string | null
  postalCode?: string | null
  countryCode: string
  phone?: string | null
}

export interface CreateStockLocationInput {
  organizationId: number
  name: string
  handle: string
  isDefault?: boolean | null
  isActive?: boolean | null
  metadata?: Record<string, unknown> | null
  address?: CreateStockLocationAddressInput
}

export interface UpdateStockLocationInput {
  name?: string
  handle?: string
  metadata?: Record<string, unknown> | null
  address?: Partial<CreateStockLocationAddressInput>
}

// ─── Pure helper (no DB access) ─────────────── | null───────────────────────────────

export function generateHandle(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
}

// ─── Domain model ────────────────────────────────────────────────────────────

export type StockLocation = InferSelectModel<typeof stockLocations>

// ─── Service contract (Effect Tag) ───────────────────────────────────────────

type FindFirstConfig = Parameters<Database<Relations>['query']['stockLocations']['findFirst']>[0]
type FindManyConfig = Parameters<Database<Relations>['query']['stockLocations']['findMany']>[0]

export class StockLocationService extends Context.Service<
  StockLocationService,
  {
    // ── Reads ─────────────────────────────────────────────────────────────
    /**
     * Single-row read via Drizzle RQBv2. Accepts any `findFirst` config —
     * `{ where: { id } }`, `{ where: { organizationId, handle } }`, etc. Fails
     * with `StockLocationNotFound` if no row matches. Soft-deleted rows are
     * implicitly excluded (`deletedAt: { isNull: true }` is merged in).
     */
    readonly findFirst: (
      config?: FindFirstConfig,
    ) => Effect.Effect<StockLocation, StockLocationNotFound | StockLocationDbFailed>

    /**
     * Multi-row read via Drizzle RQBv2. Soft-deleted rows are implicitly
     * excluded. Returns an empty array on no match (never fails with NotFound).
     */
    readonly findMany: (
      config?: FindManyConfig,
    ) => Effect.Effect<readonly StockLocation[], StockLocationDbFailed>

    // ── Writes ────────────────────────────────────────────────────────────
    // Authorization (org membership + permission) is enforced at the GraphQL
    // layer via the `permission` authScope — the service trusts its callers.
    readonly create: (
      input: CreateStockLocationInput,
    ) => Effect.Effect<StockLocation, HandleTaken | StockLocationDbFailed>

    readonly update: (
      id: number,
      expectedVersion: number,
      input: UpdateStockLocationInput,
    ) => Effect.Effect<
      StockLocation,
      StockLocationNotFound | OptimisticLockError | StockLocationDbFailed
    >

    readonly softDelete: (
      id: number,
      expectedVersion: number,
    ) => Effect.Effect<
      StockLocation,
      StockLocationNotFound | OptimisticLockError | StockLocationDbFailed
    >

    /**
     * Hard-delete the row (and cascade `stockLocationAddresses` via FK
     * `onDelete: 'cascade'`). Use `softDelete` for the auditable path —
     * this is for true purges only.
     */
    readonly delete: (
      id: number,
      expectedVersion: number,
    ) => Effect.Effect<
      StockLocation,
      StockLocationNotFound | OptimisticLockError | StockLocationDbFailed
    >

    readonly setStatus: (
      id: number,
      expectedVersion: number,
      isActive: boolean,
    ) => Effect.Effect<
      StockLocation,
      StockLocationNotFound | OptimisticLockError | StockLocationDbFailed
    >

    readonly setDefault: (
      id: number,
      expectedVersion: number,
    ) => Effect.Effect<
      StockLocation,
      StockLocationNotFound | OptimisticLockError | StockLocationDbFailed
    >
  }
>()('@czo/stock-location/StockLocationService') {}

// ─── Layer ───────────────────────────────────────────────────────────────────

type StockLocationServiceImpl = Context.Service.Shape<typeof StockLocationService>

const make = Effect.gen(function* () {
  // The kit's DrizzleDb Tag exposes the bare `Database` type. We narrow to
  // `Database<Relations>` so RQBv2 query inference matches this module's
  // schema. Runtime client is the same — only the static type changes.
  const db = (yield* DrizzleDb) as Database<Relations>
  const events = yield* StockLocationEvents

  /** Map any DB-layer error to StockLocationDbFailed. */
  const dbErr = <A, E>(eff: Effect.Effect<A, E>) =>
    eff.pipe(Effect.mapError(cause => new StockLocationDbFailed({ cause })))

  /**
   * Map a DB-layer error, but preserve `OptimisticLockError` as-is in the
   * error channel so the GraphQL layer can route it correctly.
   */
  const dbErrOptimistic = <A, E>(eff: Effect.Effect<A, E>) =>
    eff.pipe(
      Effect.mapError(e => e instanceof OptimisticLockError ? e : new StockLocationDbFailed({ cause: e })),
    )

  /** Publish a single domain event. PubSub.dropping never blocks. */
  const publish = (event: StockLocationEvent) => events.publish(event)

  // `findFirst` is a closure const so the authScope layer (and any future
  // internal caller) can reuse it. Typed once via
  // `StockLocationServiceImpl['findFirst']`; the other methods get contextual
  // typing from the `.of({...})` literal.
  const findFirst: StockLocationServiceImpl['findFirst'] = config =>
    Effect.gen(function* () {
      const row = yield* dbErr(db.query.stockLocations.findFirst({
        ...config,
        where: { ...config?.where, deletedAt: { isNull: true } },
      }))
      if (!row)
        return yield* Effect.fail(new StockLocationNotFound())
      return row
    })

  return StockLocationService.of({
    findFirst,

    findMany: config =>
      dbErr(db.query.stockLocations.findMany({
        ...config,
        where: { ...config?.where, deletedAt: { isNull: true } },
      })),

    create: input =>
      Effect.gen(function* () {
        // Pre-check for handle uniqueness within the org — the column doesn't
        // have a composite unique constraint, so we enforce it here. This is
        // racy under concurrent inserts; the optimistic-lock window is the
        // GraphQL caller's responsibility.
        const existing = yield* dbErr(db.query.stockLocations.findFirst({
          columns: { id: true },
          where: {
            organizationId: input.organizationId,
            handle: input.handle,
            deletedAt: { isNull: true },
          },
        }))
        if (existing)
          return yield* Effect.fail(new HandleTaken({ handle: input.handle }))

        const location = yield* dbErr(db.transaction(tx =>
          Effect.gen(function* () {
            const [created] = yield* tx
              .insert(stockLocationsTable)
              .values({
                organizationId: input.organizationId,
                name: input.name,
                handle: input.handle,
                isDefault: input.isDefault ?? false,
                isActive: input.isActive ?? true,
                metadata: input.metadata ?? null,
              })
              .returning()

            if (input.address) {
              yield* tx.insert(stockLocationAddresses).values({
                stockLocationId: created!.id,
                ...input.address,
              })
            }
            return created!
          }),
        ))

        yield* publish({
          _tag: 'StockLocationCreated',
          id: location.id,
          organizationId: location.organizationId,
          handle: location.handle,
          name: location.name,
        })

        return location
      }),

    update: (id, expectedVersion, input) =>
      Effect.gen(function* () {
        // Existence check — a missing row is a NotFound (404), distinct from the
        // version-mismatch OptimisticLockError that `optimisticUpdate` raises.
        yield* findFirst({ where: { id } })

        const updated = yield* dbErrOptimistic(
          optimisticUpdate({ db, table: stockLocationsTable, id, expectedVersion, values: input }),
        )

        if (input.address) {
          // Address upsert requires a full row — Partial fields would
          // violate NOT NULL columns. Callers performing a partial address
          // update should read-modify-write at the GraphQL layer.
          const addr = input.address as Required<Pick<typeof input.address, 'addressLine1' | 'city' | 'countryCode'>> & typeof input.address
          yield* dbErr(db
            .insert(stockLocationAddresses)
            .values({ stockLocationId: id, ...addr })
            .onConflictDoUpdate({
              target: stockLocationAddresses.stockLocationId,
              set: addr,
            }))
        }

        yield* publish({
          _tag: 'StockLocationUpdated',
          id,
          organizationId: updated.organizationId,
          changes: Object.keys(input).filter(k => k !== 'address'),
        })

        return updated
      }),

    softDelete: (id, expectedVersion) =>
      Effect.gen(function* () {
        // Existence check — a missing row is a NotFound (404), distinct from a
        // version-mismatch OptimisticLockError.
        yield* findFirst({ where: { id } })

        const deleted = yield* dbErrOptimistic(
          optimisticUpdate({ db, table: stockLocationsTable, id, expectedVersion, values: { deletedAt: sql`NOW()` as any } }),
        )

        yield* publish({
          _tag: 'StockLocationDeleted',
          id,
          organizationId: deleted.organizationId,
          handle: deleted.handle,
          hard: false,
        })

        return deleted
      }),

    delete: (id, expectedVersion) =>
      Effect.gen(function* () {
        // Existence check — a missing row is a NotFound (404), distinct from a
        // version-mismatch OptimisticLockError.
        yield* findFirst({ where: { id } })

        // Mirrors `optimisticUpdate`: a single DELETE gated on version. If
        // nothing was returned, we resolve the actual version (or null if
        // the row is gone) and throw an OptimisticLockError.
        const deleted = yield* dbErrOptimistic(db.transaction(tx =>
          Effect.gen(function* () {
            const [row] = yield* tx
              .delete(stockLocationsTable)
              .where(and(
                eq(stockLocationsTable.id, id),
                eq(stockLocationsTable.version, expectedVersion),
              ))
              .returning()

            if (row)
              return row

            const current = yield* tx.query.stockLocations.findFirst({
              columns: { version: true },
              where: { id },
            })
            return yield* Effect.fail(new OptimisticLockError(id, expectedVersion, current?.version ?? null))
          }),
        ))

        yield* publish({
          _tag: 'StockLocationDeleted',
          id,
          organizationId: deleted.organizationId,
          handle: deleted.handle,
          hard: true,
        })

        return deleted
      }),

    setStatus: (id, expectedVersion, isActive) =>
      Effect.gen(function* () {
        // Existence check — a missing row is a NotFound (404), distinct from a
        // version-mismatch OptimisticLockError.
        yield* findFirst({ where: { id } })

        const updated = yield* dbErrOptimistic(
          optimisticUpdate({ db, table: stockLocationsTable, id, expectedVersion, values: { isActive } }),
        )

        yield* publish({
          _tag: 'StockLocationStatusChanged',
          id,
          organizationId: updated.organizationId,
          isActive,
        })

        return updated
      }),

    setDefault: (id, expectedVersion) =>
      Effect.gen(function* () {
        // Existence check — a missing row is a NotFound (404), distinct from a
        // version-mismatch OptimisticLockError.
        yield* findFirst({ where: { id } })

        // The whole transaction stays in one Effect.gen — inner queries are
        // yield*-ed. OptimisticLockError thrown inside is preserved by
        // dbErrOptimistic so the GraphQL layer can route it.
        const result = yield* dbErrOptimistic(db.transaction(tx =>
          Effect.gen(function* () {
            // Row lock via `for: 'update'`. RQBv2 currently rejects this option
            // in its config type, so the lock stays on the QueryBuilder API.
            const [target] = yield* tx
              .select({ organizationId: stockLocationsTable.organizationId })
              .from(stockLocationsTable)
              .where(and(eq(stockLocationsTable.id, id), eq(stockLocationsTable.version, expectedVersion)))
              .for('update')
              .limit(1)

            if (!target) {
              const current = yield* tx.query.stockLocations.findFirst({
                columns: { version: true },
                where: { id },
              })
              return yield* Effect.fail(new OptimisticLockError(id, expectedVersion, current?.version ?? null))
            }

            const [previousDefault] = yield* tx
              .update(stockLocationsTable)
              .set({ isDefault: false })
              .where(and(
                eq(stockLocationsTable.organizationId, target.organizationId),
                eq(stockLocationsTable.isDefault, true),
              ))
              .returning({ id: stockLocationsTable.id })

            const updated = yield* optimisticUpdate({ db: tx, table: stockLocationsTable, id, expectedVersion, values: { isDefault: true } })

            return { updated, previousDefaultId: previousDefault?.id ?? null }
          }),
        ))

        yield* publish({
          _tag: 'StockLocationDefaultChanged',
          id,
          organizationId: result.updated.organizationId,
          previousDefaultId: result.previousDefaultId,
        })

        return result.updated
      }),
  } satisfies StockLocationServiceImpl)
})

/** Live layer. */
export const layer = Layer.effect(StockLocationService, make)
