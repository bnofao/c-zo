import type { MutationResolvers } from './../../../../__generated__/types.generated'

export const updateUser: NonNullable<MutationResolvers['updateUser']> = async (_parent, _arg, _ctx) => {
  return _ctx.auth.userService.update(_ctx.request.headers, _arg.userId, {
    ...(_arg.input.name != null && { name: _arg.input.name }),
    ...(_arg.input.email != null && { email: _arg.input.email }),
  })
}
