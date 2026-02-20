import type { MutationResolvers } from './../../../../__generated__/types.generated'

export const revokeSession: NonNullable<MutationResolvers['revokeSession']> = async (_parent, _arg, _ctx) => {
  await _ctx.auth.userService.revokeSession(_ctx.request.headers, _arg.sessionToken)

  return true
}
