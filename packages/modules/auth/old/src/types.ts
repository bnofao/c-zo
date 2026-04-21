import type { GraphQLContextMap } from '@czo/kit/graphql'
import type { SocialProviders } from 'better-auth'
import type { AccessService } from './config/access'
import type { AuthActorService } from './config/actor'
import type { Auth } from './config/auth'
import type { ApiKeyService } from './services/apiKey.service'
import type { AppService } from './services/app.service'
import type { AuthService } from './services/auth.service'
import type { OrganizationService } from './services/organization.service'
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

type AuthSession = Awaited<ReturnType<AuthService['getSession']>>

declare module '@czo/kit/graphql' {
  interface GraphQLContextMap {
    auth: {
      instance: Auth
      userService: UserService
      organizationService: OrganizationService
      authService: AuthService
      apiKeyService: ApiKeyService
      appService: AppService
      session: NonNullable<AuthSession>['session'] | null
      user: NonNullable<AuthSession>['user'] | null
    }
  }
}

declare module '@czo/kit/db' {
  interface SchemaRegistry {
    users: typeof import('./database/schema').users
    sessions: typeof import('./database/schema').sessions
    accounts: typeof import('./database/schema').accounts
    verifications: typeof import('./database/schema').verifications
    organizations: typeof import('./database/schema').organizations
    members: typeof import('./database/schema').members
    invitations: typeof import('./database/schema').invitations
    twoFactor: typeof import('./database/schema').twoFactor
    apps: typeof import('./database/schema').apps
    webhookDeliveries: typeof import('./database/schema').webhookDeliveries
    apikeys: typeof import('./database/schema').apikeys
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
    'auth:apikeys': ApiKeyService
    'auth:apps': AppService
  }
}

declare module 'nitro/types' {
  interface NitroRuntimeConfig {
    auth: {
      secret: string
      socials?: SocialProviders
      app?: {
        /** Additional event types apps can subscribe to via webhooks, merged with BASE_SUBSCRIBABLE_EVENTS. */
        subscribableEvents?: string[]
      }
    }
  }
}

/**
 * Alias for codegen compatibility — codegen.ts references `../../types#GraphQLContext`.
 * The actual shape is composed from all module augmentations of GraphQLContextMap.
 */
export type GraphQLContext = GraphQLContextMap
