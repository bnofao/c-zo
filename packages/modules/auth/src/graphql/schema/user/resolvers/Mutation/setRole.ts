import type { MutationResolvers } from './../../../../__generated__/types.generated'

export const setRole: NonNullable<MutationResolvers['setRole']> = async (_parent, _arg, _ctx) => {
  await _ctx.auth.userService.setRole(_ctx.request.headers, _arg.userId, _arg.role)

  return true
}
