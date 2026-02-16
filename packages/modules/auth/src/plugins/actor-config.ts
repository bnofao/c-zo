import type { ActorRestrictionConfig } from '../services/auth-restriction-registry'
import type { ActorTypeOptions } from './actor-type'

export const ACTOR_TYPE_OPTIONS: ActorTypeOptions = {
  actors: {
    customer: {
      allowedOAuthProviders: ['google'],
    },
    admin: {
      allowedOAuthProviders: ['github'],
    },
  },
}

export const VALID_ACTORS = new Set(Object.keys(ACTOR_TYPE_OPTIONS.actors))

export type Actor = 'customer' | 'admin'

export const DEFAULT_ACTOR_RESTRICTIONS: Record<Actor, ActorRestrictionConfig> = {
  customer: {
    allowedMethods: ['email', 'oauth:google'],
    priority: 10,
    require2FA: false,
    sessionDuration: 604800, // 7 days
    allowImpersonation: true,
  },
  admin: {
    allowedMethods: ['email', 'oauth:github', 'two-factor'],
    priority: 100,
    require2FA: true,
    sessionDuration: 28800, // 8 hours
    allowImpersonation: false,
  },
}
