import type { UserInvitationResolvers } from './../../../__generated__/types.generated'

export const UserInvitation: UserInvitationResolvers = {
  id: parent => parent.id,
  email: parent => parent.email,
  role: parent => parent.role,
  status: parent => parent.status,
  organizationId: parent => parent.organizationId,
  inviterId: parent => parent.inviterId,
  organizationName: parent => parent.organizationName,
  expiresAt: parent => parent.expiresAt,
  createdAt: parent => parent.createdAt,
}
