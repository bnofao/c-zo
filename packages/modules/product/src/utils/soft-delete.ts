import type { Kysely } from 'kysely'
import type { Database } from '../database/types'

/**
 * Soft delete a record by setting deleted_at timestamp
 * @param db - Kysely database instance
 * @param table - Table name
 * @param id - Record ID
 * @returns Updated record or null if not found
 */
export async function softDelete<T>(
  db: Kysely<any>,
  table: keyof Database,
  id: string
): Promise<T | null> {
  const result = await db
    .updateTable(table as any)
    .set({ deletedAt: new Date() } as any)
    .where('id', '=', id)
    .where('deletedAt', 'is', null)
    .returningAll()
    .executeTakeFirst()
  
  return result as T | null
}

/**
 * Query builder helper that filters out soft-deleted records
 * @param db - Kysely database instance
 * @param table - Table name
 * @returns Query builder with deleted_at filter
 */
export function activeRecordsQuery<T>(
  db: Kysely<any>,
  table: string
) {
  return db
    .selectFrom(table as any)
    .where('deleted_at', 'is', null)
}

/**
 * Check if a record is soft-deleted
 * @param record - Record to check
 * @returns True if record is deleted
 */
export function isDeleted(record: { deleted_at: Date | null }): boolean {
  return record.deleted_at !== null
}

/**
 * Restore a soft-deleted record
 * @param db - Kysely database instance
 * @param table - Table name
 * @param id - Record ID
 * @returns Restored record or null if not found
 */
export async function restoreDeleted<T>(
  db: Kysely<any>,
  table: string,
  id: string
): Promise<T | null> {
  const result = await db
    .updateTable(table as any)
    .set({ deleted_at: null } as any)
    .where('id', '=', id)
    .where('deleted_at', 'is not', null)
    .returningAll()
    .executeTakeFirst()
  
  return result as T | null
}

