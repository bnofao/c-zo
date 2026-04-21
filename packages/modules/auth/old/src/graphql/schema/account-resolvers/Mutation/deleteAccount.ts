import type { MutationResolvers } from './../../../../__generated__/types.generated'

export const deleteAccount: NonNullable<MutationResolvers['deleteAccount']> = async (_parent, _arg, _ctx) => {
  await _ctx.auth.authService.deleteAccount({
    password: _arg.input?.password ?? undefined,
    callbackURL: _arg.input?.callbackURL ?? undefined,
  }, _ctx.request.headers)
  return true
}
