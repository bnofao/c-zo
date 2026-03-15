import type { UserResolvers } from './../../../__generated__/types.generated'

export const User: UserResolvers = {
  id: parent => parent.id,
  name: parent => parent.name,
  email: parent => parent.email,
  role: parent => parent.role ?? 'user',
  banned: parent => parent.banned ?? false,
  banReason: parent => parent.banReason,
  banExpires: parent => parent.banExpires,
  createdAt: parent => parent.createdAt,
}
