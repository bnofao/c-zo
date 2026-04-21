import type { MutationResolvers } from './../../../../__generated__/types.generated'

export const verifyTotp: NonNullable<MutationResolvers['verifyTotp']> = async (_parent, _arg, _ctx) =>
  _ctx.auth.authService.verifyTotp({
    code: _arg.input.code,
    trustDevice: _arg.input.trustDevice ?? undefined,
  }, _ctx.request.headers)
