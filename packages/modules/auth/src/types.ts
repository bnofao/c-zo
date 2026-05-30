import type { UserSchema } from '@czo/auth/schema'

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
