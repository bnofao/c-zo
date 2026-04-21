import { GraphQLError } from 'graphql'
import { decodeCursor, encodeCursor } from './cursor'

export interface ConnectionArgs {
  first?: number | null
  after?: string | null
  last?: number | null
  before?: string | null
}

export interface Edge<T> {
  node: T
  cursor: string
}

export interface PageInfo {
  hasNextPage: boolean
  hasPreviousPage: boolean
  startCursor: string | null
  endCursor: string | null
}

export interface Connection<T> {
  edges: Edge<T>[]
  pageInfo: PageInfo
  totalCount: number | (() => Promise<number>) | null
}

export interface OrderByInput {
  field: string
  dir: 'ASC' | 'DESC'
}

export async function withConnection<T extends Record<string, unknown>>(opts: {
  args: ConnectionArgs
  findFunction: (args: Record<string, unknown>) => Promise<T[]>
  countFunction?: (where?: Record<string, unknown>) => Promise<number>
  getCursor?: (node: T) => string
  tiebreakers?: string[]
  maxPageSize?: number
  where?: Record<string, unknown> | null
  orderBy?: OrderByInput[] | null
  fieldMap?: Record<string, string>
}) {
  const { args, findFunction, countFunction, getCursor, where, fieldMap = {}, tiebreakers = ['id'], maxPageSize = 100 } = opts

  validateArgs(args, maxPageSize)

  const { first, last, after, before } = args

  // Decode cursor and build pagination params for the resolver/service
  const backward = last != null

  const sorts = (opts.orderBy ?? []).map(o => ({
    col: fieldMap[o.field] ?? o.field,
    dir: o.dir,
  }))

  for (const tb of tiebreakers) {
    if (!sorts.some(e => e.col === tb)) {
      sorts.push({ col: tb, dir: 'ASC' })
    }
  }

  // orderBy object-style RQBv2
  const orderBy: Record<string, 'asc' | 'desc'> = {}
  for (const { col, dir } of sorts) {
    const isAsc = (dir === 'ASC') !== backward
    orderBy[col] = isAsc ? 'asc' : 'desc'
  }

  const afterPayload = after ? decodeCursorWithValidation(after, sorts) : null
  const beforePayload = before ? decodeCursorWithValidation(before, sorts) : null

  const conditions: Record<string, unknown> = { ...(where ?? {}) }

  if (afterPayload) {
    conditions.AND = [
      ...(conditions.AND as unknown[] ?? []),
      buildKeysetWhere(sorts, afterPayload, false),
    ]
  }

  if (beforePayload) {
    conditions.AND = [
      ...(conditions.AND as unknown[] ?? []),
      buildKeysetWhere(sorts, beforePayload, true),
    ]
  }

  const size = (first ?? last) as number
  const limit = size + 1

  const sortFields = sorts.map(o => o.col)

  const _getCursor = (node: T) => {
    const values = sortFields.map((s) => {
      const v = node[s]
      if (v === undefined) {
        throw new Error(`Cursor field "${s}" is missing on row — check that orderBy/tiebreaker fields are included in the query result`)
      }
      return v
    })
    return encodeCursor([sortFields.join(','), ...values])
  }

  const nodes = await findFunction({
    where: conditions,
    orderBy,
    limit,
  })

  const connection = buildConnection({
    nodes: backward ? [...nodes].reverse() : nodes,
    args,
    getCursor: getCursor ?? _getCursor,
  })

  return {
    ...connection,
    totalCount: countFunction ? () => countFunction(conditions) : null,
  }
}

function decodeCursorWithValidation(cursor: string, sorts: { col: string }[]): unknown[] {
  const parsed = decodeCursor(cursor)
  const hash = sorts.map(s => s.col).join(',')

  if (parsed[0] !== hash) {
    throw new GraphQLError('Cursor is incompatible with current orderBy')
  }

  return parsed.slice(1)
}

export function validateArgs(args: ConnectionArgs, maxPageSize: number) {
  const { first, last } = args
  const isFirstExists = first !== null && first !== undefined
  const isLastExists = last !== null && last !== undefined

  if (!isFirstExists && !isLastExists) {
    throw new GraphQLError('You must provide either "first" or "last" argument')
  }

  if (isFirstExists && isLastExists) {
    throw new GraphQLError('Cannot use both "first" and "last" simultaneously')
  }

  if (isFirstExists && first < 0) {
    throw new GraphQLError('"first" must be a non-negative integer')
  }

  if (isLastExists && last < 0) {
    throw new GraphQLError('"last" must be a non-negative integer')
  }

  if (isFirstExists && first > maxPageSize) {
    throw new GraphQLError(`"first" must not exceed ${maxPageSize}`)
  }

  if (isLastExists && last > maxPageSize) {
    throw new GraphQLError(`"last" must not exceed ${maxPageSize}`)
  }
}

/**
 * ORDER BY a DESC, b ASC, id ASC  +  cursor [10, '2026-03-25', 'abc']
 * →
 * OR(
 *   { a: { lt: 10 } },
 *   { a: { eq: 10 }, b: { gt: '2026-03-25' } },
 *   { a: { eq: 10 }, b: { eq: '2026-03-25' }, id: { gt: 'abc' } },
 * )
 */
function buildKeysetWhere(
  sorts: { col: string, dir: 'ASC' | 'DESC' }[],
  values: unknown[],
  backward: boolean,
): Record<string, any> {
  const conditions = sorts.map((current, i) => {
    // Colonnes précédentes en eq
    const clause: Record<string, any> = Object.fromEntries(sorts.slice(0, i).map((s, index) => [s.col, { eq: values[index] }]))

    // Colonne courante en gt/lt
    const isAsc = current.dir === 'ASC'
    const op = isAsc !== backward ? 'gt' : 'lt'
    clause[current.col] = { [op]: values[i] }

    return clause
  })

  return { OR: conditions }
}

/**
 * Build a Relay Connection from pre-paginated nodes.
 * Expects the service to return limit+1 rows — the extra row signals hasNextPage.
 * The nodes are already in the correct order (service handles backward reversal).
 */
export function buildConnection<T>(opts: {
  nodes: T[]
  args: ConnectionArgs
  getCursor: (node: T) => string
}): Connection<T> {
  const { nodes, args, getCursor } = opts
  const { first, after, last, before } = args

  let trimmedNodes = nodes
  let hasNextPage = false
  let hasPreviousPage = false

  if (first != null) {
    if (trimmedNodes.length > first) {
      trimmedNodes = trimmedNodes.slice(0, first)
      hasNextPage = true
    }
    if (after) {
      hasPreviousPage = true
    }
  }
  else if (last != null) {
    if (trimmedNodes.length > last) {
      trimmedNodes = trimmedNodes.slice(trimmedNodes.length - last)
      hasPreviousPage = true
    }
    if (before) {
      hasNextPage = true
    }
  }

  const edges = trimmedNodes.map(node => ({
    node,
    cursor: getCursor(node),
  }))

  return {
    edges,
    pageInfo: {
      hasNextPage,
      hasPreviousPage,
      startCursor: edges.length > 0 ? edges[0]!.cursor : null,
      endCursor: edges.length > 0 ? edges[edges.length - 1]!.cursor : null,
    },
    totalCount: null,
  }
}
