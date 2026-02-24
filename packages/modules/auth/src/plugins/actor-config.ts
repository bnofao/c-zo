import type { ActorConfig } from '../config/actor'
import type { ActorTypeOptions } from './actor-type'

export const ACTOR_TYPE_OPTIONS: ActorTypeOptions = {
  actors: {
    admin: {
      allowedOAuthProviders: ['github'],
    },
  },
}

export const VALID_ACTORS = new Set(Object.keys(ACTOR_TYPE_OPTIONS.actors))

export type Actor = 'admin'

export const DEFAULT_ACTOR_RESTRICTIONS: Record<Actor, ActorConfig> = {
  // customer: {
  //   allowedMethods: ['email', 'oauth:google'],
  //   require2FA: false,
  //   sessionDuration: 604800, // 7 days
  //   allowImpersonation: true,
  // },
  admin: {
    allowedMethods: ['email', 'oauth:github', 'two-factor'],
    require2FA: true,
    sessionDuration: 28800, // 8 hours
    allowImpersonation: false,
  },
}
