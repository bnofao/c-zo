import { describe, expect, it, vi } from 'vitest'

const MockHTTPError = vi.hoisted(() =>
  class extends Error {
    status: number
    statusText: string
    constructor(opts: { status: number, statusText: string }) {
      super(opts.statusText)
      this.status = opts.status
      this.statusText = opts.statusText
    }
  },
)

vi.mock('nitro/h3', () => ({
  defineHandler: (fn: (event: unknown) => unknown) => fn,
  HTTPError: MockHTTPError,
}))

// eslint-disable-next-line import/first
import middleware from './auth-guard'

describe('auth-guard middleware', () => {
  function createEvent(opts: { url: string, auth?: unknown, authSecret?: unknown }) {
    return {
      req: new Request(opts.url),
      context: {
        auth: opts.auth,
        authSecret: opts.authSecret,
      } as Record<string, unknown>,
    }
  }

  it('should pass through for non-auth routes', () => {
    const event = createEvent({ url: 'http://localhost/api/products' })

    const result = (middleware as (event: unknown) => unknown)(event)

    expect(result).toBeUndefined()
  })

  it('should pass through when auth and authSecret are present', () => {
    const event = createEvent({
      url: 'http://localhost/api/auth/customer/sign-in/email',
      auth: { handler: vi.fn() },
      authSecret: 'secret-key-32-chars-minimum!!!!',
    })

    const result = (middleware as (event: unknown) => unknown)(event)

    expect(result).toBeUndefined()
  })

  it('should throw 500 when auth is missing on auth route', () => {
    const event = createEvent({
      url: 'http://localhost/api/auth/customer/sign-in/email',
      authSecret: 'secret',
    })

    expect(() => (middleware as (event: unknown) => unknown)(event))
      .toThrow(MockHTTPError)
  })

  it('should throw 500 when authSecret is missing on auth route', () => {
    const event = createEvent({
      url: 'http://localhost/api/auth/customer/sign-in/email',
      auth: { handler: vi.fn() },
    })

    expect(() => (middleware as (event: unknown) => unknown)(event))
      .toThrow(MockHTTPError)
  })

  it('should include "Auth not initialized" in error for missing auth', () => {
    const event = createEvent({
      url: 'http://localhost/api/auth/token/refresh',
      authSecret: 'secret',
    })

    try {
      ;(middleware as (event: unknown) => unknown)(event)
      expect.unreachable('Should have thrown')
    }
    catch (err) {
      expect(err).toBeInstanceOf(MockHTTPError)
      expect((err as InstanceType<typeof MockHTTPError>).statusText).toContain('Auth not initialized')
    }
  })

  it('should include "Auth secret not configured" in error for missing authSecret', () => {
    const event = createEvent({
      url: 'http://localhost/api/auth/callback/google',
      auth: { handler: vi.fn() },
    })

    try {
      ;(middleware as (event: unknown) => unknown)(event)
      expect.unreachable('Should have thrown')
    }
    catch (err) {
      expect(err).toBeInstanceOf(MockHTTPError)
      expect((err as InstanceType<typeof MockHTTPError>).statusText).toContain('Auth secret not configured')
    }
  })

  it('should not interfere with GraphQL routes', () => {
    const event = createEvent({ url: 'http://localhost/api/graphql' })

    const result = (middleware as (event: unknown) => unknown)(event)

    expect(result).toBeUndefined()
  })
})
