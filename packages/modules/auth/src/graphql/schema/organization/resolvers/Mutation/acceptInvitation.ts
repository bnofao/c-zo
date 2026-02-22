import type { MutationResolvers } from './../../../../__generated__/types.generated'

export const acceptInvitation: NonNullable<MutationResolvers['acceptInvitation']> = async (_parent, _arg, _ctx) => {
  const result = await _ctx.auth.organizationService.acceptInvitation(_ctx.request.headers, _arg.invitationId)
  if (!result) throw new Error('Invitation not found')
  return result.member
}
