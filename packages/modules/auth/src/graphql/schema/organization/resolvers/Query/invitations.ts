import type { QueryResolvers } from './../../../../__generated__/types.generated'

export const invitations: NonNullable<QueryResolvers['invitations']> = async (_parent, _arg, _ctx) =>
  _ctx.auth.organizationService.listInvitations(_arg.organizationId ?? undefined, _ctx.request.headers)
