import type { PgTable } from 'drizzle-orm/pg-core'
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'
import { and, eq, sql } from 'drizzle-orm'
import type { Database } from './manager'
import { OptimisticLockError } from './errors'

type TableWithVersion = PgTable & {
  id: any
  version: any
  updatedAt: any
}

export interface OptimisticUpdateParams<T extends TableWithVersion> {
  db: Database
  table: T
  id: number | string
  expectedVersion: number
  values: Partial<InferInsertModel<T>>
}

export async function optimisticUpdate<T extends TableWithVersion>(
  { db, table, id, expectedVersion, values }: OptimisticUpdateParams<T>,
): Promise<InferSelectModel<T>> {
  const updated = await db
    .update(table)
    .set({
      ...values,
      version: sql`${table.version} + 1`,
      updatedAt: sql`NOW()`,
    } as any)
    .where(and(eq(table.id, id), eq(table.version, expectedVersion)))
    .returning()

  if (updated.length === 0) {
    const [current] = await db
      .select({ version: table.version })
      .from(table)
      .where(eq(table.id, id))
      .limit(1)

    throw new OptimisticLockError(id, expectedVersion, current?.version ?? null)
  }

  return updated[0] as InferSelectModel<T>
}
