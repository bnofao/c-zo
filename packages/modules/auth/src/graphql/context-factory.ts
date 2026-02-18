import type { Auth } from '../config/auth.config'
import type { AuthEventsService } from '../events/auth-events'
import type { AuthRestrictionRegistry } from '../services/auth-restriction-registry'
import type { PermissionService } from '../services/permission.service'
import type { UserService } from '../services/user.service'
import { registerContextFactory } from '@czo/kit/graphql'
import { validateGraphQLAuth } from '../services/graphql-auth'

// Ensure the declaration merging in ../types is loaded
import '../types'

registerContextFactory('auth', async (serverCtx) => {
  const authInstance = serverCtx.auth as Auth
  const request = serverCtx.request as Request
  const auth = await validateGraphQLAuth({ auth: authInstance, request })

  return {
    auth,
    authInstance,
    authRestrictions: serverCtx.authRestrictions as AuthRestrictionRegistry,
    authEvents: serverCtx.authEvents as AuthEventsService,
    permissionService: serverCtx.permissionService as PermissionService,
    userService: serverCtx.userService as UserService,
    request,
  }
})
