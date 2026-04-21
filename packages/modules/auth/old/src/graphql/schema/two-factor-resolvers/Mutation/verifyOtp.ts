import type { MutationResolvers } from './../../../../__generated__/types.generated'

export const verifyOtp: NonNullable<MutationResolvers['verifyOtp']> = async (_parent, _arg, _ctx) =>
  _ctx.auth.authService.verifyOtp({
    code: _arg.input.code,
    trustDevice: _arg.input.trustDevice ?? undefined,
  }, _ctx.request.headers)
