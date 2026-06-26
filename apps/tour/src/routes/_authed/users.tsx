import { createFileRoute } from '@tanstack/react-router'
import { UsersList } from '../../components/users-list'
import { DEFAULT_USERS_PARAMS, usersQueryOptions } from '../../components/users-query'
import { GraphqlAdminError } from '../../graphql/admin-error'
import { can } from '../../lib/rbac'

export const Route = createFileRoute('/_authed/users')({
  // RBAC gate: the user list needs `user:read` (admin:viewer+). Denial throws a
  // FORBIDDEN error → classified by DataErrorBoundary into the 403 page. The
  // server still enforces the same scope; this only avoids a screen that would
  // fail anyway.
  beforeLoad: ({ context }) => {
    if (!can(context.me, 'user', 'read'))
      throw new GraphqlAdminError('Forbidden', undefined, 'FORBIDDEN')
  },
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(usersQueryOptions(DEFAULT_USERS_PARAMS))
  },
  component: UsersList,
})
