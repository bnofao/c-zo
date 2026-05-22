import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'
import type { EffectPgDatabase } from 'drizzle-orm/effect-postgres'
import type { AnyRelations } from 'drizzle-orm/relations'
import type { PgTable } from 'drizzle-orm/pg-core'
import { and, eq, sql } from 'drizzle-orm'
import { Effect } from 'effect'
import { OptimisticLockError } from './errors'

type TableWithVersion = PgTable & { id: any; version: any; updatedAt: any }

/**
 * Accepts both `EffectPgDatabase` and `EffectPgTransaction` (which extends
 * the same `PgEffectDatabase` base class). Using the widest-possible relations
 * generic so callers need no type cast.
 */
type EffectDb = EffectPgDatabase<AnyRelations>

export interface OptimisticUpdateParams<T extends TableWithVersion> {
  db: EffectDb
  table: T
  id: number | string
  expectedVersion: number
  values: Partial<InferInsertModel<T>>
}

export function optimisticUpdate<T extends TableWithVersion>(
  { db, table, id, expectedVersion, values }: OptimisticUpdateParams<T>,
): Effect.Effect<InferSelectModel<T>, OptimisticLockError | Error> {
  // Internal casts: drizzle's update/select query-builder overloads do not
  // accept the generic `PgTable` — same pattern as the previous async impl.
  // We cast the query-builder results to `Effect.Effect<unknown[]>` to avoid
  // a dual-declaration TS2719 that arises when `yield*` receives an Effect
  // returned via an `any`-typed query-builder call.
  const runUpdate = (db as any)
    .update(table)
    .set({
      ...values,
      version: sql`${table.version} + 1`,
      updatedAt: sql`NOW()`,
    })
    .where(and(eq(table.id, id), eq(table.version, expectedVersion)))
    .returning() as Effect.Effect<unknown[], Error>

  const runSelect = (db as any)
    .select({ version: table.version })
    .from(table)
    .where(eq(table.id, id))
    .limit(1) as Effect.Effect<Array<{ version: number }>, Error>

  return Effect.gen(function* () {
    const updated = yield* runUpdate

    if (updated.length === 0) {
      const rows = yield* runSelect
      const current = rows[0]
      return yield* Effect.fail(new OptimisticLockError(id, expectedVersion, current?.version ?? null))
    }

    return updated[0] as InferSelectModel<T>
  })
}
