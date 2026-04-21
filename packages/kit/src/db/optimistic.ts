import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { PgTable } from 'drizzle-orm/pg-core'
import { and, eq, sql } from 'drizzle-orm'
import { OptimisticLockError } from './errors'

type TableWithVersion = PgTable & {
  id: any
  version: any
  updatedAt: any
}

export interface OptimisticUpdateParams<T extends TableWithVersion> {
  db: NodePgDatabase<any, any>
  table: T
  id: number | string
  expectedVersion: number
  values: Partial<InferInsertModel<T>>
}

export async function optimisticUpdate<T extends TableWithVersion>(
  { db, table, id, expectedVersion, values }: OptimisticUpdateParams<T>,
): Promise<InferSelectModel<T>> {
  const updated = await (db as any)
    .update(table)
    .set({
      ...values,
      version: sql`${table.version} + 1`,
      updatedAt: sql`NOW()`,
    })
    .where(and(eq(table.id, id), eq(table.version, expectedVersion)))
    .returning() as unknown[]

  if (updated.length === 0) {
    const rows = await (db as any)
      .select({ version: table.version })
      .from(table)
      .where(eq(table.id, id))
      .limit(1) as Array<{ version: number }>

    const current = rows[0]
    throw new OptimisticLockError(id, expectedVersion, current?.version ?? null)
  }

  return updated[0] as InferSelectModel<T>
}
