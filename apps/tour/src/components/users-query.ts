import type { FetchUsersArgs, UserTab } from '../server/users.server'
import { queryOptions } from '@tanstack/react-query'
import { fetchUserCounts, fetchUsers } from '../server/users.server'

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
