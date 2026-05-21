import type { Database } from '@czo/kit/db'
import type { Context, Effect as EffectNS } from 'effect'
import type { Relations } from '../database/relations'
import type { StockLocationEvent } from '../services/events/stock-location'
import { NotAMember, OrganizationService } from '@czo/auth/services'
import { OptimisticLockError, optimisticUpdate } from '@czo/kit/db'
import { DrizzleDb } from '@czo/kit/db/effect'
import { and, eq, sql } from 'drizzle-orm'
import { Effect, Layer } from 'effect'
import { stockLocationAddresses, stockLocations } from '../database/schema'
import { StockLocationEvents } from '../services/events/stock-location'
import {
  HandleTaken,
  StockLocationDbFailed,
  StockLocationNotFound,
  StockLocationService,
} from '../services/stock-location'

type StockLocationServiceImpl = Context.Service.Shape<typeof StockLocationService>

// ─── Layer ───────────────────────────────────────────────────────────────────

export const StockLocationServiceLive = Layer.effect(
  StockLocationService,
  Effect.gen(function* () {
    // The kit's DrizzleDb Tag exposes the bare `Database` type. We narrow to
    // `Database<Relations>` so RQBv2 query inference matches this module's
    // schema. Runtime client is the same — only the static type changes.
    const db = (yield* DrizzleDb) as Database<Relations>
    const events = yield* StockLocationEvents
    const org = yield* OrganizationService

    /** Wrap a promise-returning function, mapping any error to StockLocationDbFailed. */
    const tryDb = <A>(f: () => Promise<A>) =>
      Effect.tryPromise({ try: f, catch: cause => new StockLocationDbFailed({ cause }) })

    /**
     * Wrap an optimisticUpdate-style call: preserves `OptimisticLockError`
     * as-is in the error channel, maps anything else to StockLocationDbFailed.
     */
    const tryOptimistic = <A>(f: () => Promise<A>) =>
      Effect.tryPromise({
        try: f,
        catch: e => e instanceof OptimisticLockError ? e : new StockLocationDbFailed({ cause: e }),
      })

    /** Publish a single domain event. PubSub.dropping never blocks. */
    const publish = (event: StockLocationEvent) => events.publish(event)

    /**
     * Verify the actor is a member of the given organization. Auth's
     * `OrgDbFailed` is folded into our own `StockLocationDbFailed` so the
     * error channel stays module-local.
     */
    const assertMember = (
      organizationId: number,
      actorId: number,
    ): EffectNS.Effect<void, NotAMember | StockLocationDbFailed> =>
      Effect.gen(function* () {
        const isMember = yield* org.checkMembership(organizationId, actorId).pipe(
          Effect.mapError(cause => new StockLocationDbFailed({ cause })),
        )
        if (!isMember)
          return yield* Effect.fail(new NotAMember())
      })

    // `findFirst` is a closure const so `fetchScoped` (and any future internal
    // caller) can reuse it. Typed once via `StockLocationServiceImpl['findFirst']`;
    // the other methods get contextual typing from the `.of({...})` literal.
    const findFirst: StockLocationServiceImpl['findFirst'] = config =>
      Effect.gen(function* () {
        const row = yield* tryDb(() => db.query.stockLocations.findFirst({
          ...config,
          where: { ...config?.where, deletedAt: { isNull: true } },
        }))
        if (!row)
          return yield* Effect.fail(new StockLocationNotFound())
        return row
      })

    /**
     * Fetch a stock location by id and verify the actor is a member of its
     * organization. Returns the row so callers can use `row.organizationId`
     * for downstream side-effects (events, cascading writes).
     */
    const fetchScoped = (id: number, actorId: number) =>
      Effect.gen(function* () {
        const row = yield* findFirst({ where: { id } })
        yield* assertMember(row.organizationId, actorId)
        return row
      })

    return StockLocationService.of({
      findFirst,

      findMany: config =>
        tryDb(() => db.query.stockLocations.findMany({
          ...config,
          where: { ...config?.where, deletedAt: { isNull: true } },
        })),

      create: (input, scope) =>
        Effect.gen(function* () {
          yield* assertMember(input.organizationId, scope.actorId)

          // Pre-check for handle uniqueness within the org — the column doesn't
          // have a composite unique constraint, so we enforce it here. This is
          // racy under concurrent inserts; the optimistic-lock window is the
          // GraphQL caller's responsibility.
          const existing = yield* tryDb(() => db.query.stockLocations.findFirst({
            columns: { id: true },
            where: {
              organizationId: input.organizationId,
              handle: input.handle,
              deletedAt: { isNull: true },
            },
          }))
          if (existing)
            return yield* Effect.fail(new HandleTaken({ handle: input.handle }))

          const location = yield* tryDb(() => db.transaction(async (tx) => {
            const rows = await tx
              .insert(stockLocations)
              .values({
                organizationId: input.organizationId,
                name: input.name,
                handle: input.handle,
                isDefault: input.isDefault ?? false,
                isActive: input.isActive ?? true,
                metadata: input.metadata ?? null,
              })
              .returning()
            const created = rows[0]!

            if (input.address) {
              await tx.insert(stockLocationAddresses).values({
                stockLocationId: created.id,
                ...input.address,
              })
            }
            return created
          }))

          yield* publish({
            _tag: 'StockLocationCreated',
            id: location.id,
            organizationId: location.organizationId,
            handle: location.handle,
            name: location.name,
          })

          return location
        }),

      update: (id, expectedVersion, input, scope) =>
        Effect.gen(function* () {
          yield* fetchScoped(id, scope.actorId)

          const updated = yield* tryOptimistic(() => optimisticUpdate({
            db,
            table: stockLocations,
            id,
            expectedVersion,
            values: input,
          }))

          if (input.address) {
            // Address upsert requires a full row — Partial fields would
            // violate NOT NULL columns. Callers performing a partial address
            // update should read-modify-write at the GraphQL layer.
            const addr = input.address as Required<Pick<typeof input.address, 'addressLine1' | 'city' | 'countryCode'>> & typeof input.address
            yield* tryDb(() => db
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

      softDelete: (id, expectedVersion, scope) =>
        Effect.gen(function* () {
          yield* fetchScoped(id, scope.actorId)
          const deleted = yield* tryOptimistic(() => optimisticUpdate({
            db,
            table: stockLocations,
            id,
            expectedVersion,
            values: { deletedAt: sql`NOW()` as any },
          }))

          yield* publish({
            _tag: 'StockLocationDeleted',
            id,
            organizationId: deleted.organizationId,
            handle: deleted.handle,
            hard: false,
          })

          return deleted
        }),

      delete: (id, expectedVersion, scope) =>
        Effect.gen(function* () {
          yield* fetchScoped(id, scope.actorId)
          // Mirrors `optimisticUpdate`: a single DELETE gated on version. If
          // nothing was returned, we resolve the actual version (or null if
          // the row is gone) and throw an OptimisticLockError.
          const deleted = yield* tryOptimistic(() => db.transaction(async (tx) => {
            const [row] = await tx
              .delete(stockLocations)
              .where(and(
                eq(stockLocations.id, id),
                eq(stockLocations.version, expectedVersion),
              ))
              .returning()

            if (row)
              return row

            const current = await tx.query.stockLocations.findFirst({
              columns: { version: true },
              where: { id },
            })
            throw new OptimisticLockError(id, expectedVersion, current?.version ?? null)
          }))

          yield* publish({
            _tag: 'StockLocationDeleted',
            id,
            organizationId: deleted.organizationId,
            handle: deleted.handle,
            hard: true,
          })

          return deleted
        }),

      setStatus: (id, expectedVersion, isActive, scope) =>
        Effect.gen(function* () {
          yield* fetchScoped(id, scope.actorId)
          const updated = yield* tryOptimistic(() => optimisticUpdate({
            db,
            table: stockLocations,
            id,
            expectedVersion,
            values: { isActive },
          }))

          yield* publish({
            _tag: 'StockLocationStatusChanged',
            id,
            organizationId: updated.organizationId,
            isActive,
          })

          return updated
        }),

      setDefault: (id, expectedVersion, scope) =>
        Effect.gen(function* () {
          yield* fetchScoped(id, scope.actorId)
          // The whole transaction stays in one tryPromise — Effect can't compose
          // inside Drizzle's tx callback. OptimisticLockError thrown inside is
          // preserved by tryOptimistic so the GraphQL layer can route it.
          const result = yield* tryOptimistic(() => db.transaction(async (tx) => {
            // Row lock via `for: 'update'`. RQBv2 currently rejects this option
            // in its config type, so the lock stays on the QueryBuilder API.
            const [target] = await tx
              .select({ organizationId: stockLocations.organizationId })
              .from(stockLocations)
              .where(and(eq(stockLocations.id, id), eq(stockLocations.version, expectedVersion)))
              .for('update')
              .limit(1)

            if (!target) {
              const current = await tx.query.stockLocations.findFirst({
                columns: { version: true },
                where: { id },
              })
              throw new OptimisticLockError(id, expectedVersion, current?.version ?? null)
            }

            const [previousDefault] = await tx
              .update(stockLocations)
              .set({ isDefault: false })
              .where(and(
                eq(stockLocations.organizationId, target.organizationId),
                eq(stockLocations.isDefault, true),
              ))
              .returning({ id: stockLocations.id })

            const updated = await optimisticUpdate({
              db: tx,
              table: stockLocations,
              id,
              expectedVersion,
              values: { isDefault: true },
            })

            return { updated, previousDefaultId: previousDefault?.id ?? null }
          }))

          yield* publish({
            _tag: 'StockLocationDefaultChanged',
            id,
            organizationId: result.updated.organizationId,
            previousDefaultId: result.previousDefaultId,
          })

          return result.updated
        }),
    } satisfies StockLocationServiceImpl)
  }),
)
