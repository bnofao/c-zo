import type { MutationResolvers } from './../../../../__generated__/types.generated'
import { fromGlobalId, withPaylaod } from '@czo/kit/graphql'

export const updateUser: NonNullable<MutationResolvers['updateUser']> = async (_parent, _arg, _ctx) => {
  const { name, role } = _arg.input
  return await withPaylaod({
    key: 'user',
    row: async () => _ctx.auth.userService.update(
      {
        name: name ?? undefined,
        role: role ? role.join(',') : undefined
      },
      {
        where: { id: Number(fromGlobalId(_arg.userId).id) }
      }
    ),
  })
}
