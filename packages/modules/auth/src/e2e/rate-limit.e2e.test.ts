/**
 * E2E: the REST credential routes are per-IP rate-limited.
 *
 * Boots the REAL `[auth]` app on a Testcontainers Postgres via `bootTestApp`
 * and drives `/api/auth/sign-in` through the actual h3 fetch handler — no mocks.
 * `SIGNIN_LIMITS.ipLimit` is 20: firing 21 sign-ins from ONE IP (each with a
 * DIFFERENT email so the per-EMAIL gate of 5 never trips) exercises ONLY the
 * per-IP gate. Attempts 1–20 are 401 (no such user); the 21st must be 429 with
 * a `Retry-After` header and a `{ error: 'RATE_LIMITED' }` body.
 */
import { resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { bootTestApp } from '@czo/kit/testing'
import { describe, expect, it } from '@effect/vitest'
import { Effect } from 'effect'
import authModule from '../index'

const AUTH_MIGRATIONS = resolve(fileURLToPath(new URL('../../migrations', import.meta.url)))

interface BootedApp {
  fetch: (req: Request) => Promise<Response>
  close: () => Promise<void>
}

function signIn(app: BootedApp, ip: string, email: string): Promise<Response> {
  return app.fetch(new Request('http://t/api/auth/sign-in', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify({ email, password: 'wrong-password-xyz' }),
  }))
}

const REQUEST_PASSWORD_RESET = `
  mutation Req($i: RequestPasswordResetInput!) {
    requestPasswordReset(input: $i) {
      ... on RequestPasswordResetSuccess { data { success } }
    }
  }
`

async function requestPasswordReset(app: BootedApp, ip: string, email: string): Promise<{ errors?: unknown }> {
  const res = await app.fetch(new Request('http://t/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify({ query: REQUEST_PASSWORD_RESET, variables: { i: { email } } }),
  }))
  return res.json() as Promise<{ errors?: unknown }>
}

describe('credential rate-limiting (E2E)', () => {
  it.live('returns 429 with Retry-After once the per-IP sign-in cap is exceeded', () =>
    Effect.gen(function* () {
      // eslint-disable-next-line turbo/no-undeclared-env-vars -- test-only secret; auth reads it via Effect Config at boot
      process.env.AUTH_SECRET = 'x'.repeat(40)
      // eslint-disable-next-line turbo/no-undeclared-env-vars -- test-only app id; auth reads it via Effect Config at boot
      process.env.AUTH_APP = 'test'

      const app = (yield* bootTestApp({
        modules: [authModule],
        migrations: [AUTH_MIGRATIONS],
      })) as BootedApp

      let last!: Response
      for (let n = 0; n < 21; n++)
        last = yield* Effect.promise(() => signIn(app, '203.0.113.7', `u${n}@ex.com`))

      expect(last.status).toBe(429)
      expect(last.headers.get('retry-after')).toBeTruthy()
      const body = (yield* Effect.promise(() => last.json())) as { error?: string }
      expect(body.error).toBe('RATE_LIMITED')
    }), 180_000)
})

describe('account token-flow rate-limiting (GraphQL E2E)', () => {
  it.live('rejects the 6th requestPasswordReset from one IP once the per-IP cap (5/60s) is exceeded', () =>
    Effect.gen(function* () {
      // eslint-disable-next-line turbo/no-undeclared-env-vars -- test-only secret; auth reads it via Effect Config at boot
      process.env.AUTH_SECRET = 'x'.repeat(40)
      // eslint-disable-next-line turbo/no-undeclared-env-vars -- test-only app id; auth reads it via Effect Config at boot
      process.env.AUTH_APP = 'test'

      const app = (yield* bootTestApp({
        modules: [authModule],
        migrations: [AUTH_MIGRATIONS],
      })) as BootedApp

      // Distinct emails so only the per-IP directive (not the per-account
      // cooldown) can trip; a DIFFERENT IP than the REST block so buckets
      // are never shared.
      const ip = '203.0.113.42'

      const first = yield* Effect.promise(() => requestPasswordReset(app, ip, 'r0@ex.com'))
      expect(first.errors).toBeFalsy()

      let last = first
      for (let n = 1; n < 6; n++)
        last = yield* Effect.promise(() => requestPasswordReset(app, ip, `r${n}@ex.com`))

      expect(last.errors).toBeTruthy()
      // The `@rateLimit` transformer throws the standard limit-exceeded message
      // ("too many requests, please try again in N seconds.") once the per-IP cap trips.
      expect(JSON.stringify(last.errors).toLowerCase()).toContain('too many requests')
    }), 180_000)
})
