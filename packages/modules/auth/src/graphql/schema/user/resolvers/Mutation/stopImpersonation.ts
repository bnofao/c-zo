import type { MutationResolvers } from './../../../../__generated__/types.generated'
import { publishAuthEvent } from '../../../../../events/auth-events'
import { AUTH_EVENTS } from '../../../../../events/types'

export const stopImpersonation: NonNullable<MutationResolvers['stopImpersonation']> = async (_parent, _arg, _ctx) => {
  await _ctx.auth.userService.stopImpersonating(_ctx.request.headers)

  void publishAuthEvent(AUTH_EVENTS.IMPERSONATION_STOPPED, {
    adminUserId: _ctx.auth.user!.id,
    targetUserId: _ctx.auth.session!.userId,
  })

  return true
}
