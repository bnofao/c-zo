import type { MutationResolvers } from './../../../../__generated__/types.generated'

export const acceptInvitation: NonNullable<MutationResolvers['acceptInvitation']> = async (_parent, _arg, _ctx) => {
  const result = await _ctx.auth.organizationService.acceptInvitation(_arg.invitationId, _ctx.request.headers)
  if (!result) throw new Error('Invitation not found')
  return result.member
}
