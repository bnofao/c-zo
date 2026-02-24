import type { MutationResolvers } from './../../../../__generated__/types.generated'

export const enableTwoFactor: NonNullable<MutationResolvers['enableTwoFactor']> = async (_parent, _arg, _ctx) =>
  _ctx.auth.authService.enableTwoFactor({
    password: _arg.password,
    issuer: _arg.issuer ?? undefined,
  }, _ctx.request.headers)
