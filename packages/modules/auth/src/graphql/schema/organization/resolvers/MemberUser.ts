import type { MemberUserResolvers } from './../../../__generated__/types.generated'

export const MemberUser: MemberUserResolvers = {
  id: parent => parent.id,
  email: parent => parent.email,
  name: parent => parent.name,
  image: parent => parent.image,
}
