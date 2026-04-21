import type { QueryResolvers } from './../../../../__generated__/types.generated'
import { withConnection } from '@czo/kit/graphql'

export const users: NonNullable<QueryResolvers['users']> = async (_parent, _arg, _ctx) => {
  const { where, orderBy, ...args } = _arg
  return await withConnection({
    args,
    findFunction: _ctx.auth.userService.findMany,
    countFunction: _ctx.auth.userService.count,
    where,
    orderBy,
    tiebreakers: ['id'],
  }) as any
}
