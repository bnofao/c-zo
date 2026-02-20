import type { MutationResolvers } from './../../../../__generated__/types.generated'
import { publishAuthEvent } from '../../../../../events/auth-events'
import { AUTH_EVENTS } from '../../../../../events/types'

export const impersonateUser: NonNullable<MutationResolvers['impersonateUser']> = async (_parent, _arg, _ctx) => {
  // todo: implement verification later
  // const registry = _ctx.auth.authRestrictions
  // const types = registry.getRegisteredActorTypes()
  // let targetActorType = 'unknown'
  // for (const type of types) {
  //   if (await registry.hasActorType(_arg.userId, type)) {
  //     targetActorType = type
  //     break
  //   }
  // }
  // const config = registry.getActorConfig(targetActorType)
  // if (!config.allowImpersonation) {
  //   throw new GraphQLError('Impersonation is not allowed for this user', {
  //     extensions: { code: 'FORBIDDEN', http: { status: 403 } },
  //   })
  // }

  await _ctx.auth.userService.impersonate(_ctx.request.headers, _arg.userId)

  void publishAuthEvent(AUTH_EVENTS.IMPERSONATION_STARTED, {
    adminUserId: _ctx.auth.user.id,
    targetUserId: _arg.userId,
  })

  return true
}
