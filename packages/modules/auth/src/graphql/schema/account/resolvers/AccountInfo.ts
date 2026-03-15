import type { AccountInfoResolvers } from './../../../__generated__/types.generated'

export const AccountInfo: AccountInfoResolvers = {
  user: parent => parent.user,
  data: parent => parent.data,
}
