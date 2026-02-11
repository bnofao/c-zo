import type { BetterAuthOptions } from 'better-auth'
import type { EmailService } from '../services/email.service'
import type { SecondaryStorage } from '../services/secondary-storage'
import { randomUUID } from 'node:crypto'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { jwt } from 'better-auth/plugins'
import * as schema from '../database/schema'
import { validatePasswordStrength } from '../services/password'
import { REFRESH_TOKEN_PREFIX } from '../services/token-rotation'

export interface AuthConfigOptions {
  secret: string
  baseUrl: string
  emailService?: EmailService
  redis?: { storage: SecondaryStorage }
}

export const JWT_EXPIRATION_SECONDS = 900
export const JWT_EXPIRATION_TIME = '15m'

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
      schema,
    }),
    databaseHooks: {
      session: {
        create: {
          before: async (session: { token: string }) => ({
            data: { ...session, token: `${REFRESH_TOKEN_PREFIX}${session.token}` },
          }),
        },
      },
    },
    ...(options.redis
      ? {
          secondaryStorage: options.redis.storage,
          session: { storeSessionInDatabase: true },
        }
      : {}),
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
            act: session?.activeOrganizationId ? 'admin' : 'customer',
            org: session?.activeOrganizationId ?? null,
            roles: [],
            method: 'email',
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
