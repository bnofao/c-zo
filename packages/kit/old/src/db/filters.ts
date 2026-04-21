import type { AnyColumn, SQL } from 'drizzle-orm'
import { and, eq, inArray, like, ne } from 'drizzle-orm'
import { fromGlobalId } from '../graphql/relay/global-id'

export interface StringFilterInput {
  eq?: string | null
  ne?: string | null
  contains?: string | null
  startsWith?: string | null
  endsWith?: string | null
  in?: string[] | null
}

export interface GlobalIDFilterInput {
  eq?: string | null
  in?: string[] | null
}

function escapeLike(value: string): string {
  return value.replace(/%/g, '\\%').replace(/_/g, '\\_')
}

export function applyStringFilter(column: AnyColumn, filter: StringFilterInput): SQL | undefined {
  const conditions: SQL[] = []

  if (filter.eq != null)
    conditions.push(eq(column, filter.eq))
  if (filter.ne != null)
    conditions.push(ne(column, filter.ne))
  if (filter.contains != null)
    conditions.push(like(column, `%${escapeLike(filter.contains)}%`))
  if (filter.startsWith != null)
    conditions.push(like(column, `${escapeLike(filter.startsWith)}%`))
  if (filter.endsWith != null)
    conditions.push(like(column, `%${escapeLike(filter.endsWith)}`))
  if (filter.in != null && filter.in.length > 0)
    conditions.push(inArray(column, filter.in))

  return conditions.length > 0 ? and(...conditions) : undefined
}

export function applyGlobalIdFilter(column: AnyColumn, filter: GlobalIDFilterInput): SQL | undefined {
  const conditions: SQL[] = []

  if (filter.eq != null) {
    const { id } = fromGlobalId(filter.eq)
    conditions.push(eq(column, id))
  }

  if (filter.in != null && filter.in.length > 0) {
    const ids = filter.in.map(gid => fromGlobalId(gid).id)
    conditions.push(inArray(column, ids))
  }

  return conditions.length > 0 ? and(...conditions) : undefined
}
