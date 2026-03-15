import type { UserResolvers } from './../../../__generated__/types.generated'

export const User: UserResolvers = {
  id: parent => parent.id,
  name: parent => parent.name,
  email: parent => parent.email,
  role: parent => parent.role,
  banned: parent => parent.banned,
  banReason: parent => parent.banReason,
  banExpires: parent => parent.banExpires,
  createdAt: parent => parent.createdAt,
}
