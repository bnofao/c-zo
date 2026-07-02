import { createServerFn } from '@tanstack/react-start'
import { GraphqlAdminError } from '../graphql/admin-error'
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
  /** Provider IDs of linked login accounts; empty until an invited user accepts (sets a password). */
  accounts: string[]
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

// Tab → server filter. `admins`/`all` use the API's CSV-aware `admin` arg, which
// matches role-membership ('admin' as a CSV element) consistently with
// `userCounts.admins` — so the count and the list can't diverge, and a
// multi-role admin ('admin,member') is counted AND listed. `all` excludes
// admins (admin: false, roleless users included). `unverified`/`banned` use a
// structured `where`.
const TAB_FILTER: Record<UserTab, { where?: Record<string, unknown>, admin?: boolean }> = {
  admins: { admin: true },
  all: { admin: false },
  unverified: { where: { emailVerified: { eq: false } } },
  banned: { where: { banned: { eq: true } } },
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
      accounts: string[]
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
  query AdminUsers($first: Int!, $after: String, $search: String, $where: UserWhereInput, $orderBy: [UserOrderByInput!], $admin: Boolean) {
    users(first: $first, after: $after, search: $search, where: $where, orderBy: $orderBy, admin: $admin) {
      edges { node { id name email role banned emailVerified createdAt accounts } }
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
    const filter = data.tab ? TAB_FILTER[data.tab] : undefined
    const res = await gqlAdmin<{ users: Connection }>(UsersQuery, {
      first: data.first,
      after: data.after ?? null,
      search: data.search ?? null,
      where: filter?.where ?? null,
      admin: filter?.admin ?? null,
      orderBy,
    })
    return toUserPage(res.users)
  })

// Every mutation below returns a @pothos/plugin-errors result UNION — the
// success member wraps its payload under `data`, and domain errors come back
// as DATA (not GraphQL `errors[]`), so `gqlAdmin` won't throw for them. Each
// handler must branch on `__typename` and throw `GraphqlAdminError` itself.
interface MutationResult {
  __typename: string
  data?: { user?: { id: string }, success?: boolean }
  message?: string
}

const CreateUserDoc = graphql(`
  mutation AdminCreateUser($input: CreateUserInput!) {
    createUser(input: $input) {
      __typename
      ... on CreateUserSuccess { data { user { id } } }
      ... on ValidationError { message }
      ... on UserAlreadyExistsError { message }
      ... on InvalidRoleError { message }
      ... on RoleAssignmentDeniedError { message }
      ... on CredentialLinkFailedError { message }
      ... on PasswordHashFailedError { message }
    }
  }
`)
export const createUser = createServerFn({ method: 'POST' })
  .validator((data: { email: string, name: string, roles: string[], invite: boolean }) => data)
  .handler(async ({ data }) => {
    const res = await gqlAdmin<{ createUser: MutationResult }>(CreateUserDoc, {
      input: { email: data.email, name: data.name, role: data.roles, invite: data.invite },
    })
    const result = res.createUser
    if (result.__typename !== 'CreateUserSuccess')
      throw new GraphqlAdminError(result.message ?? 'Failed to create user', undefined, result.__typename)
    return { id: result.data!.user!.id }
  })

const SetRoleDoc = graphql(`
  mutation AdminSetRole($input: SetRoleInput!) {
    setRole(input: $input) {
      __typename
      ... on SetRoleSuccess { data { user { id } } }
      ... on ForbiddenError { message }
      ... on UserNotFoundError { message }
      ... on InvalidRoleError { message }
      ... on CannotDemoteSelfError { message }
      ... on RoleAssignmentDeniedError { message }
    }
  }
`)
export const updateUserRoles = createServerFn({ method: 'POST' })
  .validator((data: { id: string, roles: string[] }) => data)
  .handler(async ({ data }) => {
    const res = await gqlAdmin<{ setRole: MutationResult }>(SetRoleDoc, {
      input: { id: data.id, role: data.roles },
    })
    const result = res.setRole
    if (result.__typename !== 'SetRoleSuccess')
      throw new GraphqlAdminError(result.message ?? 'Failed to update roles', undefined, result.__typename)
    return { id: result.data!.user!.id }
  })

const BanUserDoc = graphql(`
  mutation AdminBanUser($input: BanUserInput!) {
    banUser(input: $input) {
      __typename
      ... on BanUserSuccess { data { user { id } } }
      ... on ForbiddenError { message }
      ... on UserNotFoundError { message }
      ... on CannotBanSelfError { message }
      ... on UserAlreadyBannedError { message }
    }
  }
`)
export const banUser = createServerFn({ method: 'POST' })
  .validator((data: { id: string, reason?: string | null }) => data)
  .handler(async ({ data }) => {
    const res = await gqlAdmin<{ banUser: MutationResult }>(BanUserDoc, {
      input: { id: data.id, reason: data.reason ?? null },
    })
    const result = res.banUser
    if (result.__typename !== 'BanUserSuccess')
      throw new GraphqlAdminError(result.message ?? 'Failed to ban user', undefined, result.__typename)
    return { id: result.data!.user!.id }
  })

const UnbanUserDoc = graphql(`
  mutation AdminUnbanUser($input: UnbanUserInput!) {
    unbanUser(input: $input) {
      __typename
      ... on UnbanUserSuccess { data { user { id } } }
      ... on UserNotFoundError { message }
      ... on UserNotBannedError { message }
    }
  }
`)
export const unbanUser = createServerFn({ method: 'POST' })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const res = await gqlAdmin<{ unbanUser: MutationResult }>(UnbanUserDoc, { input: { id: data.id } })
    const result = res.unbanUser
    if (result.__typename !== 'UnbanUserSuccess')
      throw new GraphqlAdminError(result.message ?? 'Failed to unban user', undefined, result.__typename)
    return { id: result.data!.user!.id }
  })

const ResendInvitationDoc = graphql(`
  mutation AdminResendInvitation($input: ResendInvitationInput!) {
    resendInvitation(input: $input) {
      __typename
      ... on ResendInvitationSuccess { data { success } }
      ... on UserNotFoundError { message }
    }
  }
`)
export const resendInvitation = createServerFn({ method: 'POST' })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const res = await gqlAdmin<{ resendInvitation: MutationResult }>(ResendInvitationDoc, { input: { id: data.id } })
    const result = res.resendInvitation
    if (result.__typename !== 'ResendInvitationSuccess')
      throw new GraphqlAdminError(result.message ?? 'Failed to resend invitation', undefined, result.__typename)
    return { success: result.data!.success! }
  })

const RoleHierarchiesDoc = graphql(`
  query AdminRoleHierarchies {
    roleHierarchies { name tiers { name } }
  }
`)
export const fetchRoleHierarchies = createServerFn({ method: 'GET' })
  .handler(async (): Promise<{ name: string, tiers: { name: string }[] }[]> => {
    const res = await gqlAdmin<{ roleHierarchies: { name: string, tiers: { name: string }[] }[] }>(RoleHierarchiesDoc, {})
    return res.roleHierarchies
  })
