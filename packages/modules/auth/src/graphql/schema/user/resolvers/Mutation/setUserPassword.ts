import type { MutationResolvers } from './../../../../__generated__/types.generated'

export const setUserPassword: NonNullable<MutationResolvers['setUserPassword']> = async (_parent, _arg, _ctx) => {
  await _ctx.auth.userService.setUserPassword({ userId: _arg.userId, newPassword: _arg.newPassword }, _ctx.request.headers)

  return true
}
