import type { MutationResolvers } from './../../../../__generated__/types.generated'

export const rejectInvitation: NonNullable<MutationResolvers['rejectInvitation']> = async (_parent, _arg, _ctx) => {
  await _ctx.auth.organizationService.rejectInvitation(_arg.invitationId, _ctx.request.headers)
  return true
}
