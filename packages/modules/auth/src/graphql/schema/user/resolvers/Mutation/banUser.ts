import type { MutationResolvers } from './../../../../__generated__/types.generated'
import { fromGlobalId, withPaylaod } from '@czo/kit/graphql'
import { publishAuthEvent } from '../../../../../events/auth-events'
import { AUTH_EVENTS } from '../../../../../events/types'

export const banUser: NonNullable<MutationResolvers['banUser']> = async (_parent, _arg, _ctx) => {
  const { reason, expiresIn } = _arg
  
  return await withPaylaod({
    key: 'user',
    row: async () => {
      const result = await _ctx.auth.userService.update(
        {
          banned: true,
          banReason: reason ?? 'No reason',
          banExpires: expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined,
          updatedAt: new Date(),
        },
        { where: { id: Number(fromGlobalId(_arg.userId).id) } },
      )

      if (!result || result.length === 0) {
        throw new Error('Failed to ban user')
      }

      void publishAuthEvent(AUTH_EVENTS.USER_BANNED, {
        userId: _arg.userId,
        bannedBy: _ctx.auth.user!.id,
        reason: _arg.reason ?? null,
        expiresIn: _arg.expiresIn ?? null,
      })

      return result
    },
  })
}
