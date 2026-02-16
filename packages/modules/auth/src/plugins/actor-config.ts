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
