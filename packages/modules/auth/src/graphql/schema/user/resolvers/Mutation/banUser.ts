import type { MutationResolvers } from './../../../../__generated__/types.generated'
import { publishAuthEvent } from '../../../../../events/auth-events'
import { AUTH_EVENTS } from '../../../../../events/types'

export const banUser: NonNullable<MutationResolvers['banUser']> = async (_parent, _arg, _ctx) => {
  await _ctx.auth.userService.ban({
    userId: _arg.userId,
    banReason: _arg.reason ?? undefined,
    banExpiresIn: _arg.expiresIn ?? undefined,
  }, _ctx.request.headers)

  void publishAuthEvent(AUTH_EVENTS.USER_BANNED, {
    userId: _arg.userId,
    bannedBy: _ctx.auth.user!.id,
    reason: _arg.reason ?? null,
    expiresIn: _arg.expiresIn ?? null,
  })

  return true
}
