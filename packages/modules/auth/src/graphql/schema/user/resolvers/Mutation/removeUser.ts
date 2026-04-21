import type { MutationResolvers } from './../../../../__generated__/types.generated'
import { fromGlobalId, withPaylaod } from '@czo/kit/graphql'

export const removeUser: NonNullable<MutationResolvers['removeUser']> = async (_parent, _arg, _ctx) => {
  return await withPaylaod({
    key: 'user',
    row: async () => {
      return await _ctx.auth.userService.delete({
        where: { id: Number(fromGlobalId(_arg.userId).id) },
      })
    },
  })
}
