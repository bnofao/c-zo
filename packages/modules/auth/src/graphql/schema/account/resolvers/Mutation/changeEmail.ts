import type { MutationResolvers } from './../../../../__generated__/types.generated'

export const changeEmail: NonNullable<MutationResolvers['changeEmail']> = async (_parent, _arg, _ctx) => {
  await _ctx.auth.authService.changeEmail({
    newEmail: _arg.input.newEmail,
    callbackURL: _arg.input.callbackURL ?? undefined,
  }, _ctx.request.headers)
  return true
}
