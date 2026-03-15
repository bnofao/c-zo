import type { AccountInfoUserResolvers } from './../../../__generated__/types.generated'

export const AccountInfoUser: AccountInfoUserResolvers = {
  id: parent => parent.id,
  name: parent => parent.name,
  email: parent => parent.email,
  image: parent => parent.image,
  emailVerified: parent => parent.emailVerified,
}
