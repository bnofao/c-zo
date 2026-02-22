import type { MutationResolvers } from './../../../../__generated__/types.generated'

export const revokeSessions: NonNullable<MutationResolvers['revokeSessions']> = async (_parent, _arg, _ctx) => {
  await _ctx.auth.userService.revokeSessions(_arg.userId, _ctx.request.headers)

  return true
}
