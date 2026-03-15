import type { InvitationResolvers } from './../../../__generated__/types.generated'

export const Invitation: InvitationResolvers = {
  id: parent => parent.id,
  email: parent => parent.email,
  role: parent => parent.role,
  status: parent => parent.status,
  organizationId: parent => parent.organizationId,
  inviterId: parent => parent.inviterId,
  expiresAt: parent => parent.expiresAt,
  createdAt: parent => parent.createdAt,
}
