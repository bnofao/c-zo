import type { OrganizationResolvers } from './../../../__generated__/types.generated'

export const Organization: OrganizationResolvers = {
  id: parent => parent.id,
  name: parent => parent.name,
  slug: parent => parent.slug,
  logo: parent => parent.logo,
  type: parent => parent.type,
  createdAt: parent => parent.createdAt,
}
