import type { MutationResolvers } from './../../../../__generated__/types.generated'

export const unlinkAccount: NonNullable<MutationResolvers['unlinkAccount']> = async (_parent, _arg, _ctx) => {
  await _ctx.auth.authService.unlinkAccount({
    providerId: _arg.providerId,
    accountId: _arg.accountId ?? undefined,
  }, _ctx.request.headers)
  return true
}
