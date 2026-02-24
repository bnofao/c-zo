import type { MutationResolvers } from './../../../../__generated__/types.generated'

export const sendOtp: NonNullable<MutationResolvers['sendOtp']> = async (_parent, _arg, _ctx) => {
  await _ctx.auth.authService.sendOtp(_ctx.request.headers)
  return true
}
