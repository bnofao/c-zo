import type { MutationResolvers } from './../../../../__generated__/types.generated'
import { fromGlobalId, withPaylaod } from '@czo/kit/graphql'
import { publishAuthEvent } from '../../../../../events/auth-events'
import { AUTH_EVENTS } from '../../../../../events/types'

export const unbanUser: NonNullable<MutationResolvers['unbanUser']> = async (_parent, _arg, _ctx) => {
  return await withPaylaod({
    key: 'user',
    row: async () => {
      const result = await _ctx.auth.userService.update({
        banned: false,
        banExpires: null,
        banReason: null,
        updatedAt: new Date(),
      }, {
        where: { id: Number(fromGlobalId(_arg.userId).id) },
      })

      if (!result || result.length === 0) {
        throw new Error('User not found')
      }

      void publishAuthEvent(AUTH_EVENTS.USER_UNBANNED, {
        userId: _arg.userId,
        unbannedBy: _ctx.auth.user!.id,
      })

      return result
    },
  })
}
