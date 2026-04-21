import type { SQL, SQLWrapper } from 'drizzle-orm'
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core'
import { and, isNotNull, isNull } from 'drizzle-orm'

type TableWithDeletedAt = PgTable & { deletedAt: AnyPgColumn }

// ── Style v1 (query builder : db.select/update/delete) ──

export function notDeleted<T extends TableWithDeletedAt>(
  table: T,
  extraWhere?: SQL | SQLWrapper,
): SQL {
  const deletedFilter = isNull(table.deletedAt)
  return extraWhere ? and(deletedFilter, extraWhere)! : deletedFilter
}

export function onlyDeleted<T extends TableWithDeletedAt>(table: T): SQL {
  return isNotNull(table.deletedAt)
}

// ── Style v2 (RQBv2 : db.query.*.findMany/findFirst) ──

export const notDeletedFilter = {
  deletedAt: { isNull: true },
} as const

export function withNotDeleted<T extends Record<string, unknown>>(
  filter?: T,
): T & typeof notDeletedFilter {
  return { ...(filter ?? ({} as T)), ...notDeletedFilter }
}
