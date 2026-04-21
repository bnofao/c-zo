import type { GraphQLContextMap } from '@czo/kit/graphql'
import type { SocialProviders } from 'better-auth'
import type { AccessService } from './config/access'
import type { AuthActorService } from './config/actor'
import type { Auth } from './config/auth'
import type { AccountService } from './services/account.service'
import type { ApiKeyService } from './services/apiKey.service'
import type { AppService } from './services/app.service'
import type { AuthService } from './services/auth.service'
import type { OrganizationService } from './services/organization.service'
import type { SessionService } from './services/session.service'
import type { TwoFactorService } from './services/twoFactor.service'
import type { UserService } from './services/user.service'

export interface AuthContext {
  userService: UserService
  organizationService: OrganizationService
  accountService: AccountService
  sessionService: SessionService
  twoFactorService: TwoFactorService
  apiKeyService: ApiKeyService
  appService: AppService
  authService: AuthService
  /** better-auth session — narrowed when needed */
  session: any
  /** better-auth user — narrowed when needed */
  user: any
}

declare module '@czo/kit/graphql' {
  interface GraphQLContextMap {
    auth: AuthContext
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
    'auth:accounts': AccountService
    'auth:sessions': SessionService
    'auth:twoFactor': TwoFactorService
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
