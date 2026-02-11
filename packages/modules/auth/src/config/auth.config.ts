import type { BetterAuthOptions } from 'better-auth'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { jwt } from 'better-auth/plugins'
import * as schema from '../database/schema'

export interface AuthConfigOptions {
  secret: string
  baseUrl: string
}

export const JWT_EXPIRATION_SECONDS = 900
export const JWT_EXPIRATION_TIME = '15m'

export function createAuthConfig(db: unknown, options: AuthConfigOptions): BetterAuthOptions {
  return {
    secret: options.secret,
    baseURL: options.baseUrl,
    basePath: '/api/auth',
    database: drizzleAdapter(db as Parameters<typeof drizzleAdapter>[0], {
      provider: 'pg',
      schema,
    }),
    emailAndPassword: {
      enabled: true,
    },
    rateLimit: {
      window: 60,
      max: 10,
    },
    plugins: [
      jwt({
        jwks: {
          keyPairConfig: {
            alg: 'ES256',
          },
        },
        jwt: {
          issuer: options.baseUrl,
          audience: options.baseUrl,
          expirationTime: JWT_EXPIRATION_TIME,
          definePayload: ({ user }) => ({
            sub: user.id,
            email: user.email,
            name: user.name,
          }),
        },
      }),
    ],
  }
}

export function createAuth(db: unknown, options: AuthConfigOptions) {
  return betterAuth(createAuthConfig(db, options))
}

export type Auth = ReturnType<typeof createAuth>
