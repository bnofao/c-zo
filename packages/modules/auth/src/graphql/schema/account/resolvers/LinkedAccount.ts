import type { LinkedAccountResolvers } from './../../../__generated__/types.generated'

export const LinkedAccount: LinkedAccountResolvers = {
  id: parent => parent.id,
  providerId: parent => parent.providerId,
  accountId: parent => parent.accountId,
  createdAt: parent => parent.createdAt,
}
