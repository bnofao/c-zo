import type { MutationResolvers } from './../../../../__generated__/types.generated'

export const updateUser: NonNullable<MutationResolvers['updateUser']> = async (_parent, _arg, _ctx) => {
  return _ctx.auth.userService.update({
    userId: _arg.userId,
    data: {
      ...(_arg.input.name != null && { name: _arg.input.name }),
      ...(_arg.input.email != null && { email: _arg.input.email }),
    },
  }, _ctx.request.headers)
}
