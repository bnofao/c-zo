import type { OrgMemberResolvers } from './../../../__generated__/types.generated'

export const OrgMember: OrgMemberResolvers = {
  id: parent => parent.id,
  organizationId: parent => parent.organizationId,
  userId: parent => parent.userId,
  role: parent => parent.role,
  createdAt: parent => parent.createdAt,
  user: parent => parent.user,
}
