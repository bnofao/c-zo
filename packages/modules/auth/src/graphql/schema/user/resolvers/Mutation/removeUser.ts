import type { MutationResolvers } from './../../../../__generated__/types.generated'

export const removeUser: NonNullable<MutationResolvers['removeUser']> = async (_parent, _arg, _ctx) => {
  await _ctx.auth.userService.remove(_arg.userId, _ctx.request.headers)

  return true
}
