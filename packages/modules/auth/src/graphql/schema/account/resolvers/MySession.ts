import type { MySessionResolvers } from './../../../__generated__/types.generated'

export const MySession: MySessionResolvers = {
  id: parent => parent.id,
  token: parent => parent.token,
  userId: parent => parent.userId,
  expiresAt: parent => parent.expiresAt,
  ipAddress: parent => parent.ipAddress,
  userAgent: parent => parent.userAgent,
  createdAt: parent => parent.createdAt,
}
