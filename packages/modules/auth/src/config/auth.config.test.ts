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

const mockHashPassword = vi.hoisted(() => vi.fn(() => Promise.resolve('hashed')))
const mockVerifyPassword = vi.hoisted(() => vi.fn(() => Promise.resolve(true)))

vi.mock('better-auth', () => ({
  betterAuth: mockBetterAuth,
}))

vi.mock('better-auth/adapters/drizzle', () => ({
  drizzleAdapter: mockDrizzleAdapter,
}))

vi.mock('better-auth/plugins', () => ({
  jwt: mockJwt,
}))

vi.mock('better-auth/crypto', () => ({
  hashPassword: mockHashPassword,
  verifyPassword: mockVerifyPassword,
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

      expect(config.emailAndPassword).toMatchObject({ enabled: true })
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

    describe('password validation', () => {
      it('should configure password hash and verify functions', () => {
        const config = createAuthConfig(mockDb, options)
        const ep = config.emailAndPassword as Record<string, any>

        expect(ep.password).toBeDefined()
        expect(ep.password.hash).toBeTypeOf('function')
        expect(ep.password.verify).toBeTypeOf('function')
      })

      it('should set minPasswordLength and maxPasswordLength', () => {
        const config = createAuthConfig(mockDb, options)
        const ep = config.emailAndPassword as Record<string, any>

        expect(ep.minPasswordLength).toBe(8)
        expect(ep.maxPasswordLength).toBe(128)
      })

      it('should reject weak passwords during hash', async () => {
        const config = createAuthConfig(mockDb, options)
        const ep = config.emailAndPassword as Record<string, any>

        await expect(ep.password.hash('weak')).rejects.toThrow('Password too weak')
      })

      it('should accept strong passwords during hash', async () => {
        const config = createAuthConfig(mockDb, options)
        const ep = config.emailAndPassword as Record<string, any>

        const result = await ep.password.hash('MyStr0ng!Pass')
        expect(result).toBe('hashed')
        expect(mockHashPassword).toHaveBeenCalledWith('MyStr0ng!Pass')
      })

      it('should delegate verify to better-auth/crypto', async () => {
        const config = createAuthConfig(mockDb, options)
        const ep = config.emailAndPassword as Record<string, any>

        const result = await ep.password.verify({ hash: 'h', password: 'p' })
        expect(result).toBe(true)
        expect(mockVerifyPassword).toHaveBeenCalledWith({ hash: 'h', password: 'p' })
      })
    })

    describe('email verification', () => {
      it('should configure emailVerification with sendOnSignUp', () => {
        const config = createAuthConfig(mockDb, options)
        const ev = config.emailVerification as Record<string, any>

        expect(ev).toBeDefined()
        expect(ev.sendOnSignUp).toBe(true)
        expect(ev.autoSignInAfterVerification).toBe(true)
        expect(ev.expiresIn).toBe(3600)
      })

      it('should have sendVerificationEmail function', () => {
        const config = createAuthConfig(mockDb, options)
        const ev = config.emailVerification as Record<string, any>

        expect(ev.sendVerificationEmail).toBeTypeOf('function')
      })

      it('should invoke emailService.sendVerificationEmail when provided', async () => {
        const mockEmailService = {
          sendVerificationEmail: vi.fn(),
          sendPasswordResetEmail: vi.fn(),
        }
        const config = createAuthConfig(mockDb, { ...options, emailService: mockEmailService })
        const ev = config.emailVerification as Record<string, any>

        await ev.sendVerificationEmail({
          user: { email: 'test@czo.dev', name: 'Test' },
          url: 'http://verify',
          token: 'tok',
        })

        expect(mockEmailService.sendVerificationEmail).toHaveBeenCalledWith({
          to: 'test@czo.dev',
          userName: 'Test',
          url: 'http://verify',
          token: 'tok',
        })
      })

      it('should not throw when emailService is absent', async () => {
        const config = createAuthConfig(mockDb, options)
        const ev = config.emailVerification as Record<string, any>

        await expect(
          ev.sendVerificationEmail({
            user: { email: 'x@y.z', name: 'X' },
            url: 'http://u',
            token: 't',
          }),
        ).resolves.toBeUndefined()
      })
    })

    describe('password reset', () => {
      it('should configure sendResetPassword and token expiry', () => {
        const config = createAuthConfig(mockDb, options)
        const ep = config.emailAndPassword as Record<string, any>

        expect(ep.sendResetPassword).toBeTypeOf('function')
        expect(ep.resetPasswordTokenExpiresIn).toBe(3600)
        expect(ep.requireEmailVerification).toBe(false)
      })

      it('should invoke emailService.sendPasswordResetEmail when provided', async () => {
        const mockEmailService = {
          sendVerificationEmail: vi.fn(),
          sendPasswordResetEmail: vi.fn(),
        }
        const config = createAuthConfig(mockDb, { ...options, emailService: mockEmailService })
        const ep = config.emailAndPassword as Record<string, any>

        await ep.sendResetPassword({
          user: { email: 'test@czo.dev', name: 'Test' },
          url: 'http://reset',
          token: 'rst',
        })

        expect(mockEmailService.sendPasswordResetEmail).toHaveBeenCalledWith({
          to: 'test@czo.dev',
          userName: 'Test',
          url: 'http://reset',
          token: 'rst',
        })
      })

      it('should not throw when emailService is absent for password reset', async () => {
        const config = createAuthConfig(mockDb, options)
        const ep = config.emailAndPassword as Record<string, any>

        await expect(
          ep.sendResetPassword({
            user: { email: 'x@y.z', name: 'X' },
            url: 'http://u',
            token: 't',
          }),
        ).resolves.toBeUndefined()
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
