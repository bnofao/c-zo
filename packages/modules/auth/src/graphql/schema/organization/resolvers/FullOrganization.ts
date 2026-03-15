import type { FullOrganizationResolvers } from './../../../__generated__/types.generated'

export const FullOrganization: FullOrganizationResolvers = {
  id: parent => parent.id,
  name: parent => parent.name,
  slug: parent => parent.slug,
  logo: parent => parent.logo,
  type: parent => parent.type,
  metadata: parent => parent.metadata,
  createdAt: parent => parent.createdAt,
  members: parent => parent.members,
  invitations: parent => parent.invitations,
}
