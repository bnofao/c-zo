import type { BetterAuthOptions } from 'better-auth'
import type { AuthEventsService } from '../events/auth-events'
import type { EmailService } from '../services/email.service'
import type { SecondaryStorage } from '../services/secondary-storage'
import { randomUUID } from 'node:crypto'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { jwt } from 'better-auth/plugins'
import * as schema from '../database/schema'
import { validatePasswordStrength } from '../services/password'
import { getSessionContext } from '../services/session-context'
import { REFRESH_TOKEN_PREFIX } from '../services/token-rotation'

export interface AuthConfigOptions {
  secret: string
  baseUrl: string
  emailService?: EmailService
  events?: AuthEventsService
  redis?: { storage: SecondaryStorage }
}

export const JWT_EXPIRATION_SECONDS = 900
export const JWT_EXPIRATION_TIME = '15m'
export const SESSION_EXPIRY_SECONDS = 604800
export const SESSION_REFRESH_AGE = 86400

export function createAuthConfig(db: unknown, options: AuthConfigOptions): BetterAuthOptions {
  return buildAuthConfig(db, options)
}

function buildAuthConfig(db: unknown, options: AuthConfigOptions) {
  return {
    secret: options.secret,
    baseURL: options.baseUrl,
    basePath: '/api/auth',
    database: drizzleAdapter(db as Parameters<typeof drizzleAdapter>[0], {
      provider: 'pg',
      schema: {
        ...schema,
        user: schema.users,
        session: schema.sessions,
        account: schema.accounts,
        verification: schema.verifications,
      },
    }),
    user: {
      modelName: 'users',
    },
    account: {
      modelName: 'accounts',
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user: { id: string, email: string, name: string }) => {
            const ctx = getSessionContext()
            void options.events?.userRegistered({
              userId: user.id,
              email: user.email,
              actorType: ctx?.actorType ?? 'customer',
            })
          },
        },
        update: {
          after: async (user: { id: string, [key: string]: unknown }) => {
            const { id: userId, ...changes } = user
            void options.events?.userUpdated({ userId, changes })
          },
        },
      },
      session: {
        create: {
          before: async (session: { token: string }) => {
            const ctx = getSessionContext()
            return {
              data: {
                ...session,
                token: `${REFRESH_TOKEN_PREFIX}${session.token}`,
                actorType: ctx?.actorType ?? 'customer',
                authMethod: ctx?.authMethod ?? 'email',
                organizationId: ctx?.organizationId ?? null,
              },
            }
          },
          after: async (session: { id: string, userId: string, actorType?: string, authMethod?: string }) => {
            void options.events?.sessionCreated({
              sessionId: session.id,
              userId: session.userId,
              actorType: session.actorType ?? 'customer',
              authMethod: session.authMethod ?? 'email',
            })
          },
        },
      },
    },
    session: {
      modelName: 'sessions',
      expiresIn: SESSION_EXPIRY_SECONDS,
      updateAge: SESSION_REFRESH_AGE,
      additionalFields: {
        actorType: { type: 'string' as const, defaultValue: 'customer', input: false },
        authMethod: { type: 'string' as const, defaultValue: 'email', input: false },
        organizationId: { type: 'string' as const, required: false, input: false },
      },
      ...(options.redis ? { storeSessionInDatabase: true } : {}),
    },
    ...(options.redis
      ? { secondaryStorage: options.redis.storage }
      : {}),
    verification: {
      modelName: 'verifications',
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      password: {
        hash: async (password: string) => {
          const result = validatePasswordStrength(password)
          if (!result.valid) {
            throw new Error(`Password too weak: ${result.errors.join(', ')}`)
          }
          const { hashPassword } = await import('better-auth/crypto')
          return hashPassword(password)
        },
        verify: async ({ hash, password }: { hash: string, password: string }) => {
          const { verifyPassword } = await import('better-auth/crypto')
          return verifyPassword({ hash, password })
        },
      },
      requireEmailVerification: false,
      sendResetPassword: async ({ user, url, token }) => {
        await options.emailService?.sendPasswordResetEmail({
          to: user.email,
          userName: user.name,
          url,
          token,
        })
      },
      resetPasswordTokenExpiresIn: 3600,
    },
    emailVerification: {
      sendVerificationEmail: async ({ user, url, token }) => {
        await options.emailService?.sendVerificationEmail({
          to: user.email,
          userName: user.name,
          url,
          token,
        })
      },
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      expiresIn: 3600,
    },
    rateLimit: {
      window: 60,
      max: 10,
    },
    advanced: {
      cookiePrefix: 'czo',
      useSecureCookies: options.baseUrl.startsWith('https'),
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: 'lax' as const,
      },
    },
    plugins: [
      jwt({
        jwks: {
          keyPairConfig: {
            alg: 'ES256' as const,
          },
        },
        jwt: {
          issuer: options.baseUrl,
          audience: options.baseUrl,
          expirationTime: JWT_EXPIRATION_TIME,
          definePayload: ({ user, session }) => ({
            sub: user.id,
            email: user.email,
            name: user.name,
            jti: randomUUID(),
            act: session?.actorType ?? 'customer',
            org: session?.organizationId ?? null,
            roles: [],
            method: session?.authMethod ?? 'email',
          }),
        },
      }),
    ],
  } satisfies BetterAuthOptions
}

export function createAuth(db: unknown, options: AuthConfigOptions) {
  return betterAuth(buildAuthConfig(db, options))
}

export type Auth = ReturnType<typeof createAuth>
