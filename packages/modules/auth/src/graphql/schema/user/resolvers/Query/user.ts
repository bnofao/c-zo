import type { QueryResolvers } from './../../../../__generated__/types.generated'

export const user: NonNullable<QueryResolvers['user']> = async (_parent, _arg, _ctx) => _ctx.auth.userService.get(_arg.userId, _ctx.request.headers)
