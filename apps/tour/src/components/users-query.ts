import type { FetchUsersArgs, UserTab } from '../server/users.server'
import { queryOptions } from '@tanstack/react-query'
import { fetchRoleHierarchies, fetchUserCounts, fetchUsers } from '../server/users.server'

/** Page-size choices offered in the users table footer. */
export const USER_PAGE_SIZE_OPTIONS = [5, 10, 25]

/** Default page size (the middle option). */
export const USER_DEFAULT_PAGE_SIZE = USER_PAGE_SIZE_OPTIONS[1] ?? 10

/** Filter tabs, in display order. Each maps to a server-side `where` clause. */
export const USER_TABS: UserTab[] = ['admins', 'all', 'unverified', 'banned']

/** Fully-specified query params, so the react-query key is stable across renders. */
export interface UsersQueryParams {
  first: number
  after: string | null
  search: string | null
  tab: UserTab
  // Only the server-sortable columns; role/status sorting isn't supported.
  orderField: 'NAME' | 'CREATED_AT'
  orderDirection: 'ASC' | 'DESC'
}

export const DEFAULT_USERS_PARAMS: UsersQueryParams = {
  first: USER_DEFAULT_PAGE_SIZE,
  after: null,
  search: null,
  tab: 'all',
  orderField: 'NAME',
  orderDirection: 'ASC',
}

export function usersQueryOptions(params: UsersQueryParams) {
  return queryOptions({
    queryKey: ['users', params],
    queryFn: () => fetchUsers({ data: params satisfies FetchUsersArgs }),
  })
}

/** Global per-tab totals — independent of search/pagination, so a stable key. */
export function userCountsQueryOptions() {
  return queryOptions({
    queryKey: ['users', 'counts'],
    queryFn: () => fetchUserCounts(),
  })
}

export interface RoleHierarchy { name: string, tiers: { name: string }[] }

/** Domain of a role token — the segment before the first ':' (a bare role is its own domain). */
export function hierarchyOf(role: string): string {
  const i = role.indexOf(':')
  return i === -1 ? role : role.slice(0, i)
}

/** Collapse a role list to at most one tier per hierarchy, preserving the last-selected tier per domain. */
export function dedupeOneTierPerHierarchy(roles: string[], hierarchies: RoleHierarchy[]): string[] {
  const domainOf = (r: string) => hierarchies.find(h => h.tiers.some(t => t.name === r))?.name ?? hierarchyOf(r)
  const byDomain = new Map<string, string>()
  for (const r of roles) byDomain.set(domainOf(r), r)
  return [...byDomain.values()]
}

export function roleHierarchiesQueryOptions() {
  return queryOptions({
    queryKey: ['roleHierarchies'],
    queryFn: () => fetchRoleHierarchies(),
    staleTime: Infinity, // registry is static at runtime
  })
}
