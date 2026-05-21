import type { UserSchema } from '@czo/auth/schema'
import type { SocialProviders } from 'better-auth/social-providers'

export type { Relations as AuthRelations } from '@czo/auth/relations'

export interface AuthContext {
  /** better-auth session — narrowed when needed */
  session: any
  /** better-auth user — narrowed when needed */
  user?: any
}

declare module '@czo/kit/db' {
  interface SchemaRegistryShape {
    users: UserSchema
    sessions: typeof import('./database/schema').sessions
    accounts: typeof import('./database/schema').accounts
    verifications: typeof import('./database/schema').verifications
    organizations: typeof import('./database/schema').organizations
    members: typeof import('./database/schema').members
    invitations: typeof import('./database/schema').invitations
    twoFactor: typeof import('./database/schema').twoFactor
    // apps: typeof import('./database/schema').apps
    // webhookDeliveries: typeof import('./database/schema').webhookDeliveries
    apikeys: typeof import('./database/schema').apikeys
  }
}

declare module '@czo/kit/ioc' {
  interface ContainerBindings {
    // 'auth' and 'auth:access' removed: the better-auth instance lives in the
    // app-wide Effect runtime (BetterAuth Tag), and AccessService is an Effect
    // Tag. Consumers resolve them via `runEffect(useRuntime(), Tag)`.
    // TODO(effect-migration): re-add when account/session/twoFactor are migrated.
    // 'auth:accounts': AccountService
    // 'auth:sessions': SessionService
    // 'auth:twoFactor': TwoFactorService
    // 'auth:apikeys': ApiKeyService
    // 'auth:apps': AppService
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
