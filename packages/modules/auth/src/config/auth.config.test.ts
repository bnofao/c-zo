import { describe, expect, it, vi } from 'vitest'

const mockBetterAuth = vi.hoisted(() =>
  vi.fn(() => ({
    handler: vi.fn(),
    api: {
      getSession: vi.fn(),
      getToken: vi.fn(),
    },
  })),
)

const mockDrizzleAdapter = vi.hoisted(() =>
  vi.fn(() => ({ type: 'drizzle' })),
)

const mockJwt = vi.hoisted(() =>
  vi.fn((opts: unknown) => ({ id: 'jwt', options: opts })),
)

vi.mock('better-auth', () => ({
  betterAuth: mockBetterAuth,
}))

vi.mock('better-auth/adapters/drizzle', () => ({
  drizzleAdapter: mockDrizzleAdapter,
}))

vi.mock('better-auth/plugins', () => ({
  jwt: mockJwt,
}))

// eslint-disable-next-line import/first
import { createAuth, createAuthConfig, JWT_EXPIRATION_SECONDS, JWT_EXPIRATION_TIME } from './auth.config'

describe('auth config', () => {
  const mockDb = { query: vi.fn() }
  const options = {
    secret: 'test-secret-key-32-chars-minimum!',
    baseUrl: 'http://localhost:4000',
  }

  describe('constants', () => {
    it('should export JWT_EXPIRATION_SECONDS as 900', () => {
      expect(JWT_EXPIRATION_SECONDS).toBe(900)
    })

    it('should export JWT_EXPIRATION_TIME as 15m', () => {
      expect(JWT_EXPIRATION_TIME).toBe('15m')
    })
  })

  describe('createAuthConfig', () => {
    it('should return a valid config object', () => {
      const config = createAuthConfig(mockDb, options)

      expect(config.secret).toBe(options.secret)
      expect(config.baseURL).toBe(options.baseUrl)
      expect(config.basePath).toBe('/api/auth')
    })

    it('should enable email and password authentication', () => {
      const config = createAuthConfig(mockDb, options)

      expect(config.emailAndPassword).toEqual({ enabled: true })
    })

    it('should configure rate limiting', () => {
      const config = createAuthConfig(mockDb, options)

      expect(config.rateLimit).toEqual({
        window: 60,
        max: 10,
      })
    })

    it('should configure drizzle adapter with pg provider', () => {
      createAuthConfig(mockDb, options)

      expect(mockDrizzleAdapter).toHaveBeenCalledWith(
        mockDb,
        expect.objectContaining({ provider: 'pg' }),
      )
    })

    it('should include the JWT plugin', () => {
      const config = createAuthConfig(mockDb, options)

      expect(config.plugins).toBeDefined()
      expect(config.plugins!.length).toBeGreaterThan(0)
      expect(mockJwt).toHaveBeenCalled()
    })

    it('should configure JWT with ES256 algorithm', () => {
      createAuthConfig(mockDb, options)

      expect(mockJwt).toHaveBeenCalledWith(
        expect.objectContaining({
          jwks: expect.objectContaining({
            keyPairConfig: { alg: 'ES256' },
          }),
        }),
      )
    })

    it('should set JWT issuer and audience to baseUrl', () => {
      createAuthConfig(mockDb, options)

      expect(mockJwt).toHaveBeenCalledWith(
        expect.objectContaining({
          jwt: expect.objectContaining({
            issuer: options.baseUrl,
            audience: options.baseUrl,
            expirationTime: JWT_EXPIRATION_TIME,
          }),
        }),
      )
    })

    it('should provide a definePayload function', () => {
      createAuthConfig(mockDb, options)

      const jwtCall = mockJwt.mock.calls[mockJwt.mock.calls.length - 1]![0] as Record<string, any>
      const { definePayload } = jwtCall.jwt

      expect(definePayload).toBeTypeOf('function')

      const payload = definePayload({
        user: { id: 'u1', email: 'test@czo.dev', name: 'Test' },
      })
      expect(payload).toEqual({
        sub: 'u1',
        email: 'test@czo.dev',
        name: 'Test',
      })
    })
  })

  describe('createAuth', () => {
    it('should call betterAuth with the config', () => {
      createAuth(mockDb, options)

      expect(mockBetterAuth).toHaveBeenCalled()
    })

    it('should return an auth instance with handler and api', () => {
      const auth = createAuth(mockDb, options)

      expect(auth.handler).toBeDefined()
      expect(auth.api).toBeDefined()
      expect(auth.api.getSession).toBeDefined()
      expect(auth.api.getToken).toBeDefined()
    })
  })
})
