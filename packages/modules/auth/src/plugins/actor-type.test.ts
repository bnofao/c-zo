import { describe, expect, it } from 'vitest'
import { ACTOR_TYPE_HEADER, actorType, AUTH_METHOD_HEADER, getValidActors, isProviderAllowedForActor } from './actor-type'

const TEST_OPTIONS = {
  actors: {
    customer: {
      allowedOAuthProviders: ['google'],
    },
    admin: {
      allowedOAuthProviders: ['github'],
    },
  },
}

describe('actorType plugin', () => {
  const plugin = actorType(TEST_OPTIONS)

  describe('plugin metadata', () => {
    it('should have id "actor-type"', () => {
      expect(plugin.id).toBe('actor-type')
    })
  })

  describe('onRequest', () => {
    it('should pass through when no actor header is set', async () => {
      const request = new Request('http://localhost/api/auth/sign-in/email', {
        method: 'POST',
      })

      const result = await plugin.onRequest!(request, {} as never)

      expect(result).toBeUndefined()
    })

    it('should pass through for valid actor "customer"', async () => {
      const request = new Request('http://localhost/api/auth/sign-in/email', {
        method: 'POST',
        headers: { [ACTOR_TYPE_HEADER]: 'customer' },
      })

      const result = await plugin.onRequest!(request, {} as never)

      expect(result).toBeUndefined()
    })

    it('should pass through for valid actor "admin"', async () => {
      const request = new Request('http://localhost/api/auth/sign-in/email', {
        method: 'POST',
        headers: { [ACTOR_TYPE_HEADER]: 'admin' },
      })

      const result = await plugin.onRequest!(request, {} as never)

      expect(result).toBeUndefined()
    })

    it('should return 400 response for invalid actor', async () => {
      const request = new Request('http://localhost/api/auth/sign-in/email', {
        method: 'POST',
        headers: { [ACTOR_TYPE_HEADER]: 'hacker' },
      })

      const result = await plugin.onRequest!(request, {} as never)

      expect(result).toBeDefined()
      const response = (result as { response: Response }).response
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toContain('Invalid actor: hacker')
      expect(body.error).toContain('customer')
      expect(body.error).toContain('admin')
    })

    it('should return JSON content-type on error response', async () => {
      const request = new Request('http://localhost/api/auth/sign-in/email', {
        method: 'POST',
        headers: { [ACTOR_TYPE_HEADER]: 'unknown' },
      })

      const result = await plugin.onRequest!(request, {} as never)
      const response = (result as { response: Response }).response

      expect(response.headers.get('content-type')).toBe('application/json')
    })
  })

  describe('hooks.before[0] (universal context injection)', () => {
    const contextHook = plugin.hooks!.before![0]!

    it('should match all paths', () => {
      expect(contextHook.matcher({ path: '/sign-in/email' } as never)).toBe(true)
      expect(contextHook.matcher({ path: '/sign-in/social' } as never)).toBe(true)
      expect(contextHook.matcher({ path: '/sign-up/email' } as never)).toBe(true)
      expect(contextHook.matcher({ path: '/callback/google' } as never)).toBe(true)
    })

    it('should inject actorType into ctx.context from header', async () => {
      const authContext: Record<string, unknown> = {}

      await (contextHook.handler as (ctx: unknown) => Promise<void>)({
        headers: new Headers({ [ACTOR_TYPE_HEADER]: 'admin' }),
        context: authContext,
      })

      expect(authContext.actorType).toBe('admin')
    })

    it('should inject authMethod into ctx.context from header', async () => {
      const authContext: Record<string, unknown> = {}

      await (contextHook.handler as (ctx: unknown) => Promise<void>)({
        headers: new Headers({
          [ACTOR_TYPE_HEADER]: 'customer',
          [AUTH_METHOD_HEADER]: 'oauth:google',
        }),
        context: authContext,
      })

      expect(authContext.authMethod).toBe('oauth:google')
    })

    it('should default authMethod to "email" when header is absent', async () => {
      const authContext: Record<string, unknown> = {}

      await (contextHook.handler as (ctx: unknown) => Promise<void>)({
        headers: new Headers({ [ACTOR_TYPE_HEADER]: 'customer' }),
        context: authContext,
      })

      expect(authContext.authMethod).toBe('email')
    })

    it('should not inject when no actor header is present', async () => {
      const authContext: Record<string, unknown> = {}

      await (contextHook.handler as (ctx: unknown) => Promise<void>)({
        headers: new Headers(),
        context: authContext,
      })

      expect(authContext.actorType).toBeUndefined()
      expect(authContext.authMethod).toBeUndefined()
    })

    it('should read actor from request.headers as fallback', async () => {
      const authContext: Record<string, unknown> = {}

      await (contextHook.handler as (ctx: unknown) => Promise<void>)({
        headers: new Headers(),
        request: new Request('http://localhost/api/auth/sign-in', {
          headers: { [ACTOR_TYPE_HEADER]: 'admin' },
        }),
        context: authContext,
      })

      expect(authContext.actorType).toBe('admin')
    })
  })

  describe('hooks.before[1] (callback state-based actor extraction)', () => {
    const callbackHook = plugin.hooks!.before![1]!

    it('should match /callback/ paths', () => {
      expect(callbackHook.matcher({ path: '/callback/google' } as never)).toBe(true)
      expect(callbackHook.matcher({ path: '/callback/github' } as never)).toBe(true)
    })

    it('should not match non-callback paths', () => {
      expect(callbackHook.matcher({ path: '/sign-in/email' } as never)).toBe(false)
      expect(callbackHook.matcher({ path: '/sign-in/social' } as never)).toBe(false)
    })

    it('should extract actor from state verification record', async () => {
      const authContext: Record<string, unknown> = {
        internalAdapter: {
          findVerificationValue: async () => ({
            value: JSON.stringify({ actor: 'customer', callbackURL: '/cb' }),
          }),
        },
      }

      await (callbackHook.handler as (ctx: unknown) => Promise<void>)({
        headers: new Headers(),
        request: new Request('http://localhost/api/auth/callback/google?state=test-state-id'),
        context: authContext,
      })

      expect(authContext.actorType).toBe('customer')
      expect(authContext.authMethod).toBe('oauth:google')
    })

    it('should extract provider from URL path for authMethod', async () => {
      const authContext: Record<string, unknown> = {
        internalAdapter: {
          findVerificationValue: async () => ({
            value: JSON.stringify({ actor: 'admin' }),
          }),
        },
      }

      await (callbackHook.handler as (ctx: unknown) => Promise<void>)({
        headers: new Headers(),
        request: new Request('http://localhost/api/auth/callback/github?state=test-state-id'),
        context: authContext,
      })

      expect(authContext.actorType).toBe('admin')
      expect(authContext.authMethod).toBe('oauth:github')
    })

    it('should skip when no state query parameter', async () => {
      const authContext: Record<string, unknown> = {
        internalAdapter: {
          findVerificationValue: async () => null,
        },
      }

      await (callbackHook.handler as (ctx: unknown) => Promise<void>)({
        headers: new Headers(),
        request: new Request('http://localhost/api/auth/callback/google'),
        context: authContext,
      })

      expect(authContext.actorType).toBeUndefined()
    })

    it('should skip when verification record not found', async () => {
      const authContext: Record<string, unknown> = {
        internalAdapter: {
          findVerificationValue: async () => null,
        },
      }

      await (callbackHook.handler as (ctx: unknown) => Promise<void>)({
        headers: new Headers(),
        request: new Request('http://localhost/api/auth/callback/google?state=unknown-state'),
        context: authContext,
      })

      expect(authContext.actorType).toBeUndefined()
    })

    it('should skip when state JSON is invalid', async () => {
      const authContext: Record<string, unknown> = {
        internalAdapter: {
          findVerificationValue: async () => ({
            value: 'not-valid-json',
          }),
        },
      }

      await (callbackHook.handler as (ctx: unknown) => Promise<void>)({
        headers: new Headers(),
        request: new Request('http://localhost/api/auth/callback/google?state=test-state'),
        context: authContext,
      })

      expect(authContext.actorType).toBeUndefined()
    })

    it('should skip when actor in state is not a valid actor', async () => {
      const authContext: Record<string, unknown> = {
        internalAdapter: {
          findVerificationValue: async () => ({
            value: JSON.stringify({ actor: 'hacker' }),
          }),
        },
      }

      await (callbackHook.handler as (ctx: unknown) => Promise<void>)({
        headers: new Headers(),
        request: new Request('http://localhost/api/auth/callback/google?state=test-state'),
        context: authContext,
      })

      expect(authContext.actorType).toBeUndefined()
    })

    it('should skip when actor field is missing from state', async () => {
      const authContext: Record<string, unknown> = {
        internalAdapter: {
          findVerificationValue: async () => ({
            value: JSON.stringify({ callbackURL: '/cb' }),
          }),
        },
      }

      await (callbackHook.handler as (ctx: unknown) => Promise<void>)({
        headers: new Headers(),
        request: new Request('http://localhost/api/auth/callback/google?state=test-state'),
        context: authContext,
      })

      expect(authContext.actorType).toBeUndefined()
    })

    it('should skip when request is missing', async () => {
      const authContext: Record<string, unknown> = {}

      await (callbackHook.handler as (ctx: unknown) => Promise<void>)({
        headers: new Headers(),
        context: authContext,
      })

      expect(authContext.actorType).toBeUndefined()
    })

    it('should default authMethod to "oauth" when provider cannot be extracted', async () => {
      const authContext: Record<string, unknown> = {
        internalAdapter: {
          findVerificationValue: async () => ({
            value: JSON.stringify({ actor: 'customer' }),
          }),
        },
      }

      await (callbackHook.handler as (ctx: unknown) => Promise<void>)({
        headers: new Headers(),
        request: new Request('http://localhost/api/auth/callback/?state=test-state'),
        context: authContext,
      })

      expect(authContext.actorType).toBe('customer')
      expect(authContext.authMethod).toBe('oauth')
    })
  })

  describe('hooks.before[2] (two-factor authMethod injection)', () => {
    const twoFactorHook = plugin.hooks!.before![2]!

    it('should match /two-factor/verify-totp path', () => {
      expect(twoFactorHook.matcher({ path: '/two-factor/verify-totp' } as never)).toBe(true)
    })

    it('should match /two-factor/verify-backup-code path', () => {
      expect(twoFactorHook.matcher({ path: '/two-factor/verify-backup-code' } as never)).toBe(true)
    })

    it('should not match non-two-factor paths', () => {
      expect(twoFactorHook.matcher({ path: '/sign-in/email' } as never)).toBe(false)
      expect(twoFactorHook.matcher({ path: '/sign-up/email' } as never)).toBe(false)
    })

    it('should set authMethod to "two-factor" when actor header is present', async () => {
      const authContext: Record<string, unknown> = {}

      await (twoFactorHook.handler as (ctx: unknown) => Promise<void>)({
        headers: new Headers({ [ACTOR_TYPE_HEADER]: 'customer' }),
        context: authContext,
      })

      expect(authContext.authMethod).toBe('two-factor')
    })

    it('should not set authMethod when no actor header', async () => {
      const authContext: Record<string, unknown> = {}

      await (twoFactorHook.handler as (ctx: unknown) => Promise<void>)({
        headers: new Headers(),
        context: authContext,
      })

      expect(authContext.authMethod).toBeUndefined()
    })
  })

  describe('hooks.before[3] (OAuth provider restriction + additionalData)', () => {
    const oauthHook = plugin.hooks!.before![3]!

    it('should match /sign-in/social path', () => {
      expect(oauthHook.matcher({ path: '/sign-in/social' } as never)).toBe(true)
    })

    it('should not match other paths', () => {
      expect(oauthHook.matcher({ path: '/sign-in/email' } as never)).toBe(false)
      expect(oauthHook.matcher({ path: '/sign-up/email' } as never)).toBe(false)
    })

    it('should inject actor into body.additionalData', async () => {
      const body: Record<string, unknown> = { provider: 'google' }

      await (oauthHook.handler as (ctx: unknown) => Promise<void>)({
        headers: new Headers({ [ACTOR_TYPE_HEADER]: 'customer' }),
        body,
      })

      expect(body.additionalData).toEqual({ actor: 'customer' })
    })

    it('should preserve existing additionalData fields', async () => {
      const body: Record<string, unknown> = {
        provider: 'google',
        additionalData: { callbackURL: 'http://localhost/cb' },
      }

      await (oauthHook.handler as (ctx: unknown) => Promise<void>)({
        headers: new Headers({ [ACTOR_TYPE_HEADER]: 'customer' }),
        body,
      })

      expect(body.additionalData).toEqual({
        callbackURL: 'http://localhost/cb',
        actor: 'customer',
      })
    })

    it('should not inject additionalData when no actor header', async () => {
      const body: Record<string, unknown> = { provider: 'google' }

      await (oauthHook.handler as (ctx: unknown) => Promise<void>)({
        headers: new Headers(),
        body,
      })

      expect(body.additionalData).toBeUndefined()
    })

    it('should set authMethod from body.provider', async () => {
      const body: Record<string, unknown> = { provider: 'google' }
      const authContext: Record<string, unknown> = {}

      await (oauthHook.handler as (ctx: unknown) => Promise<void>)({
        headers: new Headers({ [ACTOR_TYPE_HEADER]: 'customer' }),
        body,
        context: authContext,
      })

      expect(authContext.authMethod).toBe('oauth:google')
    })

    it('should not set authMethod when provider is absent', async () => {
      const body: Record<string, unknown> = {}
      const authContext: Record<string, unknown> = {}

      await (oauthHook.handler as (ctx: unknown) => Promise<void>)({
        headers: new Headers({ [ACTOR_TYPE_HEADER]: 'customer' }),
        body,
        context: authContext,
      })

      expect(authContext.authMethod).toBeUndefined()
    })
  })

  describe('constants', () => {
    it('should export ACTOR_TYPE_HEADER', () => {
      expect(ACTOR_TYPE_HEADER).toBe('x-czo-actor')
    })

    it('should export AUTH_METHOD_HEADER', () => {
      expect(AUTH_METHOD_HEADER).toBe('x-czo-auth-method')
    })
  })
})

describe('isProviderAllowedForActor', () => {
  it('should allow google for customer', () => {
    expect(isProviderAllowedForActor(TEST_OPTIONS, 'google', 'customer')).toBe(true)
  })

  it('should not allow github for customer', () => {
    expect(isProviderAllowedForActor(TEST_OPTIONS, 'github', 'customer')).toBe(false)
  })

  it('should allow github for admin', () => {
    expect(isProviderAllowedForActor(TEST_OPTIONS, 'github', 'admin')).toBe(true)
  })

  it('should not allow google for admin', () => {
    expect(isProviderAllowedForActor(TEST_OPTIONS, 'google', 'admin')).toBe(false)
  })

  it('should return false for unknown actor', () => {
    expect(isProviderAllowedForActor(TEST_OPTIONS, 'google', 'unknown')).toBe(false)
  })

  it('should return false for unknown provider', () => {
    expect(isProviderAllowedForActor(TEST_OPTIONS, 'twitter', 'customer')).toBe(false)
  })
})

describe('getValidActors', () => {
  it('should return a set of valid actor names', () => {
    const actors = getValidActors(TEST_OPTIONS)

    expect(actors).toBeInstanceOf(Set)
    expect(actors.has('customer')).toBe(true)
    expect(actors.has('admin')).toBe(true)
    expect(actors.has('unknown')).toBe(false)
    expect(actors.size).toBe(2)
  })
})
