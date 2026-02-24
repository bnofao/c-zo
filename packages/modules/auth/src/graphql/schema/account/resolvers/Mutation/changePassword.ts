import type { MutationResolvers } from './../../../../__generated__/types.generated'

export const changePassword: NonNullable<MutationResolvers['changePassword']> = async (_parent, _arg, _ctx) => {
  await _ctx.auth.authService.changePassword({
    currentPassword: _arg.input.currentPassword,
    newPassword: _arg.input.newPassword,
    revokeOtherSessions: _arg.input.revokeOtherSessions ?? undefined,
  }, _ctx.request.headers)
  return true
}
