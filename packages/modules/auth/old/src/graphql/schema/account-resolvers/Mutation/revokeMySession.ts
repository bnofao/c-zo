import type { MutationResolvers } from './../../../../__generated__/types.generated'

export const revokeMySession: NonNullable<MutationResolvers['revokeMySession']> = async (_parent, _arg, _ctx) => {
  await _ctx.auth.authService.revokeSession(_arg.token, _ctx.request.headers)
  return true
}
