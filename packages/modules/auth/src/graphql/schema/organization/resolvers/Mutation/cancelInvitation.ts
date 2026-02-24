import type { MutationResolvers } from './../../../../__generated__/types.generated'

export const cancelInvitation: NonNullable<MutationResolvers['cancelInvitation']> = async (_parent, _arg, _ctx) => {
  await _ctx.auth.organizationService.cancelInvitation(_arg.invitationId, _ctx.request.headers)
  return true
}
