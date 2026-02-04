import type { SQL } from 'drizzle-orm'
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core'
import type { OrderByClause, WhereClause } from './types'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { and, asc, desc, eq, isNull } from 'drizzle-orm'

/**
 * Generate a new UUID for entity IDs
 */
export function generateId(): string {
  return randomUUID()
}

/**
 * Apply where clause to a query
 * Supports both partial entity objects and raw SQL
 */
export function applyWhere<T>(
  table: PgTable,
  where: WhereClause<T>,
): SQL | undefined {
  // If it's already a SQL expression, return it
  if (typeof where === 'object' && 'queryChunks' in where) {
    return where as SQL
  }

  // Build conditions from partial object
  const conditions: SQL[] = []
  const columns = Object.entries(table as Record<string, PgColumn>)
    .filter(([, value]) => value && typeof value === 'object' && 'name' in value)

  for (const [key, value] of Object.entries(where as Record<string, unknown>)) {
    if (value === undefined)
      continue

    const column = columns.find(([colKey]) => colKey === key)?.[1]
    if (column) {
      conditions.push(eq(column, value))
    }
  }

  if (conditions.length === 0)
    return undefined
  if (conditions.length === 1)
    return conditions[0]
  return and(...conditions)
}

/**
 * Apply order by clause to get SQL order expressions
 */
export function applyOrderBy<T>(
  table: PgTable,
  orderBy: OrderByClause<T>,
): SQL[] {
  const orders: SQL[] = []
  const columns = Object.entries(table as Record<string, PgColumn>)
    .filter(([, value]) => value && typeof value === 'object' && 'name' in value)

  for (const [key, direction] of Object.entries(orderBy)) {
    const column = columns.find(([colKey]) => colKey === key)?.[1]
    if (column) {
      orders.push(direction === 'desc' ? desc(column) : asc(column))
    }
  }

  return orders
}

/**
 * Get the soft delete condition for a table
 */
export function getSoftDeleteCondition(table: PgTable): SQL | undefined {
  const deletedAtColumn = (table as Record<string, PgColumn>).deletedAt
  if (deletedAtColumn) {
    return isNull(deletedAtColumn)
  }
  return undefined
}

/**
 * Encode cursor for pagination
 */
export function encodeCursor(id: string): string {
  return Buffer.from(id).toString('base64')
}

/**
 * Decode cursor for pagination
 */
export function decodeCursor(cursor: string): string {
  return Buffer.from(cursor, 'base64').toString('utf-8')
}
