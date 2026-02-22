import type { QueryResolvers } from './../../../../__generated__/types.generated'

export const invitation: NonNullable<QueryResolvers['invitation']> = async (_parent, _arg, _ctx) =>
  _ctx.auth.organizationService.getInvitation(_arg.invitationId, _ctx.request.headers)
