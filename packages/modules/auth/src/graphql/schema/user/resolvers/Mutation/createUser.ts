import type { MutationResolvers } from './../../../../__generated__/types.generated'

export const createUser: NonNullable<MutationResolvers['createUser']> = async (_parent, _arg, _ctx) => _ctx.auth.userService.create(_ctx.request.headers, {
  email: _arg.input.email,
  name: _arg.input.name,
  password: _arg.input.password ?? undefined,
  role: _arg.input.role ?? undefined,
})
