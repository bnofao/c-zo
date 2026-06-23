import { createServerFn } from '@tanstack/react-start'
import { graphql } from '../graphql/gen'
import { gqlAdmin } from '../graphql/gql-admin.server'

export interface UserRow {
  id: string
  name: string
  email: string
  role: string
  banned: boolean
  emailVerified: boolean
  createdAt: string
}

export interface UserPage { rows: UserRow[], endCursor: string | null, hasNextPage: boolean }

export type UserTab = 'admins' | 'all' | 'unverified' | 'banned'

export interface FetchUsersArgs {
  first: number
  after?: string | null
  /** Server-side full-text term (matched against name/email by the API). */
  search?: string | null
  /** Which group of users to show — translated to a server-side `where` clause. */
  tab?: UserTab
  /** Server-sortable fields only — the API can't sort by role or status. */
  orderField?: 'NAME' | 'EMAIL' | 'CREATED_AT'
  orderDirection?: 'ASC' | 'DESC'
}

// Tab → relay `where`. Each tab is a positive `eq` match (no admin-exclusion):
// regular users carry a NULL `role` in the DB, and SQL negation (`role <> 'admin'`)
// drops NULLs, while `StringFilter` exposes no `isNull` operator — so excluding
// admins server-side isn't expressible. `all` returns everyone (no filter).
const ADMIN_ROLE = 'admin'
const TAB_WHERE: Record<UserTab, Record<string, unknown> | undefined> = {
  admins: { role: { eq: ADMIN_ROLE } },
  all: undefined,
  unverified: { emailVerified: { eq: false } },
  banned: { banned: { eq: true } },
}

interface Connection {
  edges: {
    node: {
      id: string
      name: string
      email: string
      role: string
      banned: boolean | null
      emailVerified: boolean
      createdAt: string
    }
  }[]
  pageInfo: { endCursor: string | null, hasNextPage: boolean }
}

export function toUserPage(c: Connection): UserPage {
  return {
    rows: c.edges.map(e => ({ ...e.node, banned: e.node.banned ?? false })),
    endCursor: c.pageInfo.endCursor,
    hasNextPage: c.pageInfo.hasNextPage,
  }
}

// Server-side relay pagination: the table sends `first`/`after` (cursor),
// `search`, and `orderBy`. Role-based filtering and role/status sorting aren't
// expressible on the admin API, so those table affordances are dropped.
const UsersQuery = graphql(`
  query AdminUsers($first: Int!, $after: String, $search: String, $where: UserWhereInput, $orderBy: [UserOrderByInput!]) {
    users(first: $first, after: $after, search: $search, where: $where, orderBy: $orderBy) {
      edges { node { id name email role banned emailVerified createdAt } }
      pageInfo { endCursor hasNextPage }
    }
  }
`)

// Per-tab totals — `UserCounts` keys are 1:1 with `UserTab` values, so the UI
// can index `counts[tab]` directly. Independent of pagination/search/active tab.
export type UserCounts = Record<UserTab, number>

const UserCountsQuery = graphql(`
  query AdminUserCounts {
    userCounts { all admins unverified banned }
  }
`)

export const fetchUserCounts = createServerFn({ method: 'GET' })
  .handler(async (): Promise<UserCounts> => {
    const res = await gqlAdmin<{ userCounts: UserCounts }>(UserCountsQuery, {})
    return res.userCounts
  })

export const fetchUsers = createServerFn({ method: 'GET' })
  .validator((data: FetchUsersArgs) => data)
  .handler(async ({ data }): Promise<UserPage> => {
    const orderBy = data.orderField
      ? [{ field: data.orderField, direction: data.orderDirection ?? 'ASC' }]
      : undefined
    const res = await gqlAdmin<{ users: Connection }>(UsersQuery, {
      first: data.first,
      after: data.after ?? null,
      search: data.search ?? null,
      where: data.tab ? TAB_WHERE[data.tab] ?? null : null,
      orderBy,
    })
    return toUserPage(res.users)
  })
