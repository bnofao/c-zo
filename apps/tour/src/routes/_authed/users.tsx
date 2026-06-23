import { createFileRoute } from '@tanstack/react-router'
import { UsersList } from '../../components/users-list'
import { DEFAULT_USERS_PARAMS, usersQueryOptions } from '../../components/users-query'

export const Route = createFileRoute('/_authed/users')({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(usersQueryOptions(DEFAULT_USERS_PARAMS))
  },
  component: UsersList,
})
