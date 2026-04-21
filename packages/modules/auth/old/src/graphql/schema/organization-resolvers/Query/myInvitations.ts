import type { QueryResolvers } from './../../../../__generated__/types.generated'

export const myInvitations: NonNullable<QueryResolvers['myInvitations']> = async (_parent, _arg, _ctx) =>
  _ctx.auth.organizationService.listUserInvitations(undefined, _ctx.request.headers)
