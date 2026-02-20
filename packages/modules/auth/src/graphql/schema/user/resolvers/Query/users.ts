import type { QueryResolvers } from './../../../../__generated__/types.generated'
import { translateUserWhereInput } from './utils'

export const users: NonNullable<QueryResolvers['users']> = async (_parent, _arg, _ctx) => {
  const whereParams = translateUserWhereInput(_arg.where, _arg.orderBy)

  return _ctx.auth.userService.list(_ctx.request.headers, {
    limit: _arg.limit ?? undefined,
    offset: _arg.offset ?? undefined,
    ...(_arg.search ? { searchValue: _arg.search, searchField: 'email' as const } : {}),
    ...whereParams,
  })
}
