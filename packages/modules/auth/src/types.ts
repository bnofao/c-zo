import type { GraphQLContextMap } from '@czo/kit/graphql'
import type { Auth } from './config/auth.config'
import type { AuthEventsService } from './events/auth-events'
import type { AuthRestrictionRegistry } from './services/auth-restriction-registry'
import type { PermissionService } from './services/permission.service'
import type { UserService } from './services/user.service'

export interface AuthContext {
  session: {
    id: string
    userId: string
    expiresAt: Date
    actorType: string
    authMethod: string
    organizationId: string | null
    impersonatedBy: string | null
  }
  user: {
    id: string
    email: string
    name: string
    twoFactorEnabled: boolean
    role: string
    banned: boolean
    banReason: string | null
  }
  actorType: string
  organization: string | null
  authSource: 'bearer' | 'cookie' | 'api-key'
}

declare module '@czo/kit/graphql' {
  interface GraphQLContextMap {
    auth: AuthContext
    authInstance: Auth
    authRestrictions: AuthRestrictionRegistry
    authEvents: AuthEventsService
    permissionService: PermissionService
    userService: UserService
    request: Request
  }
}

/**
 * Alias for codegen compatibility — codegen.ts references `../../types#GraphQLContext`.
 * The actual shape is composed from all module augmentations of GraphQLContextMap.
 */
export type GraphQLContext = GraphQLContextMap
