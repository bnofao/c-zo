import type { MutationResolvers } from './../../../../__generated__/types.generated'

export const removeUser: NonNullable<MutationResolvers['removeUser']> = async (_parent, _arg, _ctx) => {
  await _ctx.auth.userService.remove(_ctx.request.headers, _arg.userId)

  return true
}
