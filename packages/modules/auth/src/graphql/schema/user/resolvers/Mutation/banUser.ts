import type { MutationResolvers } from './../../../../__generated__/types.generated'
import { publishAuthEvent } from '../../../../../events/auth-events'
import { AUTH_EVENTS } from '../../../../../events/types'

export const banUser: NonNullable<MutationResolvers['banUser']> = async (_parent, _arg, _ctx) => {
  await _ctx.auth.userService.ban(
    _ctx.request.headers,
    _arg.userId,
    _arg.reason ?? undefined,
    _arg.expiresIn ?? undefined,
  )

  void publishAuthEvent(AUTH_EVENTS.USER_BANNED, {
    userId: _arg.userId,
    bannedBy: _ctx.auth.user.id,
    reason: _arg.reason ?? null,
    expiresIn: _arg.expiresIn ?? null,
  })

  return true
}
