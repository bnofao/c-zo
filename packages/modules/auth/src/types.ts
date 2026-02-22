import type { GraphQLContextMap } from '@czo/kit/graphql'
import type { SocialProviders } from 'better-auth'
import type { AccessService } from './config/access'
import type { AuthActorService } from './config/actor'
import type { Auth } from './config/auth'
import type { AuthService } from './services/auth.service'
import type { OrganizationService } from './services/organization.service'
import type { UserService } from './services/user.service'
// import { Session, User } from 'better-auth'

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

type AuthSession = Awaited<ReturnType<AuthService['getSession']>>

declare module '@czo/kit/graphql' {
  interface GraphQLContextMap {
    auth: {
      instance: Auth
      userService: UserService
      organizationService: OrganizationService
      authService: AuthService
      session: NonNullable<AuthSession>['session']
      user: NonNullable<AuthSession>['user']
    }
    // authInstance: Auth
    // authRestrictions: AuthRestrictionRegistry
    // permissionService: PermissionService
    // userService: UserService
  }
}

declare module '@czo/kit/ioc' {
  interface ContainerBindings {
    'auth': Auth
    'auth:actor': AuthActorService
    'auth:access': AccessService
    'auth:users': UserService
    'auth:service': AuthService
    'auth:organizations': OrganizationService
  }
}

declare module 'nitro/types' {
  interface NitroRuntimeConfig {
    auth: {
      secret: string
      socials?: SocialProviders
    }
  }
}

/**
 * Alias for codegen compatibility — codegen.ts references `../../types#GraphQLContext`.
 * The actual shape is composed from all module augmentations of GraphQLContextMap.
 */
export type GraphQLContext = GraphQLContextMap
