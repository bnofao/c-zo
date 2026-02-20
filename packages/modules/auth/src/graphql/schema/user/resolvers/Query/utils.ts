import type { ListUsersParams } from '../../../../../services/user.service'
import type { BooleanFilterInput, DateTimeFilterInput, UserOrderByInput, UserWhereInput } from '../../../../__generated__/types.generated'

type FilterOperator = NonNullable<ListUsersParams['filterOperator']>

interface FilterResult {
  filterField: string
  filterValue: string
  filterOperator: FilterOperator
}

function extractBooleanFilter(
  field: string,
  filter: BooleanFilterInput,
): FilterResult | undefined {
  if (filter.eq != null) {
    return { filterField: field, filterValue: String(filter.eq), filterOperator: 'eq' }
  }
  return undefined
}

function extractDateTimeFilter(
  field: string,
  filter: DateTimeFilterInput,
): FilterResult | undefined {
  const operators: Array<[keyof DateTimeFilterInput, FilterOperator]> = [
    ['eq', 'eq'],
    ['ne', 'ne'],
    ['gt', 'gt'],
    ['gte', 'gte'],
    ['lt', 'lt'],
    ['lte', 'lte'],
  ]

  for (const [key, op] of operators) {
    const value = filter[key]
    if (value != null) {
      return { filterField: field, filterValue: String(value), filterOperator: op }
    }
  }

  return undefined
}

function extractFilterFromNode(
  where: UserWhereInput,
): FilterResult | undefined {
  if (where.emailVerified) {
    const result = extractBooleanFilter('emailVerified', where.emailVerified)
    if (result)
      return result
  }
  if (where.createdAt) {
    const result = extractDateTimeFilter('createdAt', where.createdAt)
    if (result)
      return result
  }
  return undefined
}

function extractFilterFromTree(
  where: UserWhereInput,
): FilterResult | undefined {
  const filter = extractFilterFromNode(where)
  if (filter)
    return filter

  if (where.AND) {
    for (const clause of where.AND) {
      const nested = extractFilterFromTree(clause)
      if (nested)
        return nested
    }
  }

  if (where.OR) {
    for (const clause of where.OR) {
      const nested = extractFilterFromTree(clause)
      if (nested)
        return nested
    }
  }

  return undefined
}

// ─── Public API ─────────────────────────────────────────────────────

export function translateUserWhereInput(
  where: UserWhereInput | null | undefined,
  orderBy: UserOrderByInput | null | undefined,
): Partial<ListUsersParams> {
  const params: Partial<ListUsersParams> = {}

  if (where) {
    const filter = extractFilterFromTree(where)

    if (filter) {
      params.filterField = filter.filterField
      params.filterValue = filter.filterValue
      params.filterOperator = filter.filterOperator
    }
  }

  if (orderBy) {
    params.sortBy = orderBy.field
    params.sortDirection = orderBy.direction.toLowerCase() as 'asc' | 'desc'
  }

  return params
}
