import type { MutationResolvers } from './../../../../__generated__/types.generated'

export const disableTwoFactor: NonNullable<MutationResolvers['disableTwoFactor']> = async (_parent, _arg, _ctx) => {
  await _ctx.auth.authService.disableTwoFactor(_arg.password, _ctx.request.headers)
  return true
}
