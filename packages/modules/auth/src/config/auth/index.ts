import type { Auth as BetterAuth, BetterAuthOptions, SocialProviders } from 'better-auth'
import type { AccessControl } from 'better-auth/plugins'
import type { AccessRole } from '../access'
import type { Storage } from './others'
import { betterAuth } from 'better-auth'
import { openAPI } from 'better-auth/plugins'
import { ACTOR_TYPE_OPTIONS } from '../../plugins/actor-config'
import { actorType } from '../../plugins/actor-type'
import { accountConfig } from './account'
import { adminConfig } from './admin'
import { apiKeyConfig, apiKeyHooks } from './apikey'
import { databaseConfig } from './database'
import { organizationConfig } from './organization'
import { advancedConfig, emailAndPasswordConfig, emailVerificationConfig, rateLimitConfig, secondaryStorageConfig } from './others'
import { sessionConfig, sessionHooks } from './session'
import { socialConfig } from './social'
import { twoFactorConfig } from './twoFactor'
import { userConfig, userHooks } from './user'
import { verificationConfig } from './verification'

export interface AuthOption {
  app: string
  secret: string
  baseUrl?: string
  storage?: Storage
  socials?: SocialProviders
  adminRoles?: readonly string[]
  ac?: AccessControl
  roles?: Record<string, AccessRole>
}

export type Auth = ReturnType<typeof createAuth>

function buildAuthConfig(db: unknown, option: AuthOption)/* : BetterAuthOptions & { databaseHooks?: Record<string, unknown> }  */{
  const cookiePrefix = option.app.replace(/[^a-z0-9]/gi, '').toLowerCase()
  const apiKeyPrefix = `${cookiePrefix}_`

  return {
    secret: option.secret,
    baseURL: option.baseUrl,
    basePath: '/api/auth',
    database: databaseConfig(db),
    user: userConfig(),
    account: accountConfig(/* todo: add social providers list */),
    socialProviders: socialConfig(option.socials, option.baseUrl),
    databaseHooks: {
      user: userHooks(),
      session: sessionHooks(),
      apikey: apiKeyHooks(),
    },
    session: sessionConfig(),
    secondaryStorage: secondaryStorageConfig(option.storage),
    verification: verificationConfig(),
    emailAndPassword: emailAndPasswordConfig(),
    emailVerification: emailVerificationConfig(),
    rateLimit: rateLimitConfig(),
    advanced: advancedConfig({ cookiePrefix }),
    plugins: [
      adminConfig({ ac: option.ac, roles: option.roles }),
      twoFactorConfig({ issuer: option.app }),
      openAPI({ disableDefaultReference: true }),
      actorType(ACTOR_TYPE_OPTIONS),
      apiKeyConfig({ defaultPrefix: apiKeyPrefix }),
      organizationConfig({ ac: option.ac, roles: option.roles, /*  {
        //   viewer: viewerRole,
        //   ...(options.accessRegistry?.roles() ?? {}),
      } */ }),
    ],
  }
}

export function createAuth(db: unknown, options: AuthOption)/* : Auth */ {
  return betterAuth(buildAuthConfig(db, options))
}
