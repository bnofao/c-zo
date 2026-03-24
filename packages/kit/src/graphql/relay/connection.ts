export interface ConnectionArgs {
  first?: number
  after?: string
  last?: number
  before?: string
}

export interface PaginateResult<T> {
  nodes: T[]
  totalCount: number
  getCursor?: (node: T) => string
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
  totalCount: number
}

export function buildConnection<T>(opts: {
  nodes: T[]
  args: ConnectionArgs
  totalCount: number
  getCursor: (node: T) => string
}): Connection<T> {
  const { nodes, args, totalCount, getCursor } = opts
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
    if (!before && totalCount > trimmedNodes.length) {
      hasPreviousPage = true
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
    totalCount,
  }
}
