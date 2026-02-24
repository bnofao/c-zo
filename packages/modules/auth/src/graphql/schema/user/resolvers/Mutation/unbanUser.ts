import type { MutationResolvers } from './../../../../__generated__/types.generated'
import { publishAuthEvent } from '../../../../../events/auth-events'
import { AUTH_EVENTS } from '../../../../../events/types'

export const unbanUser: NonNullable<MutationResolvers['unbanUser']> = async (_parent, _arg, _ctx) => {
  await _ctx.auth.userService.unban(_arg.userId, _ctx.request.headers)

  void publishAuthEvent(AUTH_EVENTS.USER_UNBANNED, {
    userId: _arg.userId,
    unbannedBy: _ctx.auth.user!.id,
  })

  return true
}
