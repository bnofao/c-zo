import type { Awaitable, SocialProviders } from 'better-auth'
import type { AccessControl } from 'better-auth/plugins'
import type { AccessRole } from '../../services'
import type { Storage } from './others'
import { DrizzleDb } from '@czo/kit/db/effect'
import { betterAuth } from 'better-auth'
import { bearer, openAPI } from 'better-auth/plugins'
import { Effect, Layer } from 'effect'
import { AccessService, BetterAuth } from '../../services'
import { accountConfig } from './account'
import { actorType } from './actor'
import { adminConfig } from './admin'
import { apiKeyConfig, apiKeyHooks } from './apikey'
import { databaseConfig } from './database'
import { organizationConfig } from './organization'
import { advancedConfig, emailAndPasswordConfig, emailVerificationConfig, rateLimitConfig, secondaryStorageConfig } from './others'
import { sessionConfig, sessionHooks } from './session'
import { socialConfig } from './social'
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
  trustedOrigins?: (string[] | ((request?: Request | undefined) => Awaitable<(string | undefined | null)[]>)) | undefined
}

export type Auth = ReturnType<typeof createAuth>

function buildAuthConfig(db: unknown, option: AuthOption)/* : BetterAuthOptions & { databaseHooks?: Record<string, unknown> }  */ {
  const cookiePrefix = option.app.replace(/[^a-z0-9]/gi, '').toLowerCase()
  const apiKeyPrefix = `${cookiePrefix}_`

  return {
    secret: option.secret,
    baseURL: option.baseUrl,
    basePath: '/api/auth',
    trustedOrigins: option.trustedOrigins,
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
    rateLimit: rateLimitConfig(undefined, option.storage),
    advanced: advancedConfig({ cookiePrefix, disableOriginCheck: true }),
    plugins: [
      bearer(),
      adminConfig({ ac: option.ac, roles: option.roles }),
      // twoFactorConfig({ issuer: option.app }),
      openAPI({ disableDefaultReference: true }),
      actorType(),
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
      // '/admin/impersonate-user',
      // '/admin/stop-impersonating',
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
      // '/organization/set-active',
      '/organization/list-members',
      '/organization/list-invitations',
      '/organization/get-invitation',
      '/organization/check-slug',
      '/organization/get-active-member',
      '/organization/get-active-member-role',
      '/organization/invite-member',
      '/organization/cancel-invitation',
      // '/organization/accept-invitation',
      // '/organization/reject-invitation',
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

// ─── Effect Layer for the BetterAuth instance ─────────────────────────

/**
 * Build a `BetterAuthLive` Layer that lazily materializes the better-auth
 * instance from the runtime: it `yield*`s `DrizzleDb` (shared infra) and
 * `AccessService` (in-runtime, seeded by `makeAccessServiceLive`), calls
 * `buildRoles` to get `{ ac, roles }`, and feeds them into `createAuth`.
 *
 * The caller passes the non-access parts of `AuthOption` (app, secret, baseUrl,
 * socials, storage). `ac` and `roles` are filled in by this Layer, so they are
 * intentionally absent from the parameter type.
 *
 * Type inference: `createAuth(db, opts)` keeps its sync, non-generic signature
 * with no explicit return annotation, so `Auth = ReturnType<typeof createAuth>`
 * continues to capture the structural type of `betterAuth(...)` unchanged.
 */
export function makeBetterAuthLive(opts: Omit<AuthOption, 'ac' | 'roles'>) {
  return Layer.effect(
    BetterAuth,
    Effect.gen(function* () {
      const db = yield* DrizzleDb
      const access = yield* AccessService
      const { ac, roles } = yield* access.buildRoles
      return createAuth(db, { ...opts, ac, roles })
    }),
  )
}
