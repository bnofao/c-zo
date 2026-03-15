import type { UserListResolvers } from './../../../__generated__/types.generated'

export const UserList: UserListResolvers = {
  users: parent => parent.users,
  total: parent => parent.total,
}
