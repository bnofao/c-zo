import type { UserConnectionResolvers } from './../../../__generated__/types.generated'

export const UserConnection: UserConnectionResolvers = {
  totalCount: (parent) => {
    const count = (parent as Record<string, unknown>).totalCount
    return typeof count === 'function' ? count() : count
  },
}
