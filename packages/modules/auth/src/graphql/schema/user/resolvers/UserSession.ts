import type { UserSessionResolvers } from './../../../__generated__/types.generated'

export const UserSession: UserSessionResolvers = {
  id: parent => parent.id,
  userId: parent => parent.userId,
  expiresAt: parent => parent.expiresAt,
  ipAddress: parent => parent.ipAddress,
  userAgent: parent => parent.userAgent,
  impersonatedBy: parent => parent.impersonatedBy,
  createdAt: parent => parent.createdAt,
}
