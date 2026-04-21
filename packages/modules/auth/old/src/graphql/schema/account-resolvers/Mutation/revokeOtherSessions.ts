import type { MutationResolvers } from './../../../../__generated__/types.generated'

export const revokeOtherSessions: NonNullable<MutationResolvers['revokeOtherSessions']> = async (_parent, _arg, _ctx) => {
  await _ctx.auth.authService.revokeOtherSessions(_ctx.request.headers)
  return true
}
