import type { SocialProviders } from 'better-auth'
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

function buildAuthConfig(db: unknown, option: AuthOption)/* : BetterAuthOptions & { databaseHooks?: Record<string, unknown> }  */ {
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
    disabledPaths: [
      // ─── Admin (covered by user/session GraphQL resolvers) ─────────
      '/admin/list-users',
      '/admin/get-user',
      '/admin/list-user-sessions',
      '/admin/create-user',
      '/admin/update-user',
      '/admin/impersonate-user',
      '/admin/stop-impersonating',
      '/admin/ban-user',
      '/admin/unban-user',
      '/admin/set-role',
      '/admin/remove-user',
      '/admin/revoke-user-session',
      '/admin/revoke-user-sessions',
      '/admin/set-user-password',
      '/admin/has-permission',
      // ─── Organization (covered by organization GraphQL resolvers) ──
      '/organization/list',
      '/organization/get-full-organization',
      '/organization/create',
      '/organization/update',
      '/organization/delete',
      '/organization/set-active',
      '/organization/list-members',
      '/organization/list-invitations',
      '/organization/get-invitation',
      '/organization/check-slug',
      '/organization/get-active-member',
      '/organization/get-active-member-role',
      '/organization/invite-member',
      '/organization/cancel-invitation',
      '/organization/accept-invitation',
      '/organization/reject-invitation',
      '/organization/remove-member',
      '/organization/update-member-role',
      '/organization/leave',
      '/organization/list-user-invitations',
      '/organization/has-permission',
      // ─── API Key (covered by apiKey GraphQL resolvers) ─────────────
      '/api-key/create',
      '/api-key/get',
      '/api-key/update',
      '/api-key/delete',
      '/api-key/list',
      // ─── Account (covered by account GraphQL resolvers) ────────────
      '/change-password',
      '/change-email',
      '/update-user',
      '/delete-user',
      '/list-accounts',
      '/unlink-account',
      '/account-info',
      // ─── Session (covered by account GraphQL resolvers) ────────────
      '/list-sessions',
      '/revoke-session',
      '/revoke-other-sessions',
      // ─── Two-Factor (covered by two-factor GraphQL resolvers) ──────
      '/two-factor/get-totp-uri',
      '/two-factor/enable',
      '/two-factor/disable',
      '/two-factor/verify-totp',
      '/two-factor/send-otp',
      '/two-factor/verify-otp',
      '/two-factor/verify-backup-code',
      '/two-factor/generate-backup-codes',
    ],
  }
}

export function createAuth(db: unknown, options: AuthOption)/* : Auth */ {
  return betterAuth(buildAuthConfig(db, options))
}
