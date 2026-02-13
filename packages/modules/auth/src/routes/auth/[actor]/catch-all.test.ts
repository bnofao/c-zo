import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetRouterParam = vi.hoisted(() => vi.fn())
const mockRunWithSessionContext = vi.hoisted(() =>
  vi.fn((_data: unknown, fn: () => unknown) => fn()),
)

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
  defineHandler: (fn: (event: unknown) => Promise<unknown>) => fn,
  getRouterParam: mockGetRouterParam,
  HTTPError: MockHTTPError,
}))

vi.mock('../../../config/auth.config', () => ({
  JWT_EXPIRATION_SECONDS: 900,
}))

vi.mock('../../../services/session-context', () => ({
  runWithSessionContext: mockRunWithSessionContext,
}))

// eslint-disable-next-line import/first
import handler, { VALID_ACTORS } from './[...all]'

describe('auth [actor] catch-all route', () => {
  const mockGetToken = vi.fn()
  const mockHandler = vi.fn()

  function createEvent(overrides?: { auth?: unknown, actor?: string }) {
    const req = new Request(`http://localhost/api/auth/${overrides?.actor ?? 'customer'}/sign-in/email`, {
      method: 'POST',
    })
    return {
      req,
      context: {
        auth: overrides?.auth !== undefined
          ? overrides.auth
          : {
              handler: mockHandler,
              api: { getToken: mockGetToken },
            },
      },
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('actor validation', () => {
    it('should accept "customer" as valid actor', async () => {
      mockGetRouterParam.mockReturnValue('customer')
      mockHandler.mockResolvedValue(new Response('{}', { status: 200 }))
      const event = createEvent({ actor: 'customer' })

      await (handler as (event: unknown) => Promise<unknown>)(event)

      expect(mockHandler).toHaveBeenCalled()
    })

    it('should accept "admin" as valid actor', async () => {
      mockGetRouterParam.mockReturnValue('admin')
      mockHandler.mockResolvedValue(new Response('{}', { status: 200 }))
      const event = createEvent({ actor: 'admin' })

      await (handler as (event: unknown) => Promise<unknown>)(event)

      expect(mockHandler).toHaveBeenCalled()
    })

    it('should reject invalid actor with 400', async () => {
      mockGetRouterParam.mockReturnValue('hacker')
      const event = createEvent({ actor: 'hacker' })

      const err = await (handler as (event: unknown) => Promise<unknown>)(event)
        .catch((e: unknown) => e) as InstanceType<typeof MockHTTPError>

      expect(err).toBeInstanceOf(MockHTTPError)
      expect(err.status).toBe(400)
      expect(err.statusText).toContain('Invalid actor')
    })

    it('should reject missing actor with 400', async () => {
      mockGetRouterParam.mockReturnValue(undefined)
      const event = createEvent()

      const err = await (handler as (event: unknown) => Promise<unknown>)(event)
        .catch((e: unknown) => e) as InstanceType<typeof MockHTTPError>

      expect(err).toBeInstanceOf(MockHTTPError)
      expect(err.status).toBe(400)
    })

    it('should export VALID_ACTORS constant', () => {
      expect(VALID_ACTORS).toEqual(['customer', 'admin'])
    })
  })

  describe('context injection', () => {
    it('should set event.context.actor', async () => {
      mockGetRouterParam.mockReturnValue('customer')
      mockHandler.mockResolvedValue(new Response('{}', { status: 200 }))
      const event = createEvent({ actor: 'customer' })

      await (handler as (event: unknown) => Promise<unknown>)(event)

      expect((event.context as Record<string, unknown>).actor).toBe('customer')
    })
  })

  describe('url rewriting', () => {
    it('should strip actor segment from URL path', async () => {
      mockGetRouterParam.mockReturnValue('customer')
      mockHandler.mockResolvedValue(new Response('{}', { status: 200 }))
      const event = createEvent({ actor: 'customer' })

      await (handler as (event: unknown) => Promise<unknown>)(event)

      const calledReq = mockHandler.mock.calls[0]![0] as Request
      const url = new URL(calledReq.url)
      expect(url.pathname).toBe('/api/auth/sign-in/email')
    })

    it('should strip admin actor segment from URL path', async () => {
      mockGetRouterParam.mockReturnValue('admin')
      const req = new Request('http://localhost/api/auth/admin/sign-up/email', { method: 'POST' })
      mockHandler.mockResolvedValue(new Response('{}', { status: 200 }))
      const event = {
        req,
        context: {
          auth: { handler: mockHandler, api: { getToken: mockGetToken } },
        },
      }

      await (handler as (event: unknown) => Promise<unknown>)(event)

      const calledReq = mockHandler.mock.calls[0]![0] as Request
      const url = new URL(calledReq.url)
      expect(url.pathname).toBe('/api/auth/sign-up/email')
    })
  })

  describe('error handling', () => {
    it('should throw HTTPError 500 if auth is not in context', async () => {
      mockGetRouterParam.mockReturnValue('customer')
      const event = createEvent({ auth: null })

      const err = await (handler as (event: unknown) => Promise<unknown>)(event)
        .catch((e: unknown) => e) as InstanceType<typeof MockHTTPError>

      expect(err).toBeInstanceOf(MockHTTPError)
      expect(err.status).toBe(500)
    })
  })

  describe('session context propagation', () => {
    it('should wrap handler call with runWithSessionContext for customer', async () => {
      mockGetRouterParam.mockReturnValue('customer')
      mockHandler.mockResolvedValue(new Response('{}', { status: 200 }))
      const event = createEvent({ actor: 'customer' })

      await (handler as (event: unknown) => Promise<unknown>)(event)

      expect(mockRunWithSessionContext).toHaveBeenCalledWith(
        { actorType: 'customer', authMethod: 'email' },
        expect.any(Function),
      )
    })

    it('should wrap handler call with runWithSessionContext for admin', async () => {
      mockGetRouterParam.mockReturnValue('admin')
      mockHandler.mockResolvedValue(new Response('{}', { status: 200 }))
      const event = createEvent({ actor: 'admin' })

      await (handler as (event: unknown) => Promise<unknown>)(event)

      expect(mockRunWithSessionContext).toHaveBeenCalledWith(
        { actorType: 'admin', authMethod: 'email' },
        expect.any(Function),
      )
    })
  })

  describe('response transformation (sign-in/sign-up)', () => {
    it('should transform sign-in response to dual-token format', async () => {
      mockGetRouterParam.mockReturnValue('customer')
      const sessionData = {
        session: { token: 'czo_rt_session-token' },
        user: { id: 'u1' },
      }
      mockHandler.mockResolvedValue(new Response(JSON.stringify(sessionData), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
      mockGetToken.mockResolvedValue({ token: 'eyJhbG.jwt.token' })

      const event = createEvent({ actor: 'customer' })

      const result = await (handler as (event: unknown) => Promise<unknown>)(event) as Response
      const body = await result.json()

      expect(body).toEqual({
        accessToken: 'eyJhbG.jwt.token',
        refreshToken: 'czo_rt_session-token',
        expiresIn: 900,
      })
    })

    it('should transform sign-up response to dual-token format', async () => {
      mockGetRouterParam.mockReturnValue('customer')
      const sessionData = {
        session: { token: 'czo_rt_new-session' },
        user: { id: 'u2' },
      }
      const req = new Request('http://localhost/api/auth/customer/sign-up/email', { method: 'POST' })
      mockHandler.mockResolvedValue(new Response(JSON.stringify(sessionData), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
      mockGetToken.mockResolvedValue({ token: 'eyJhbG.jwt.signup' })

      const event = {
        req,
        context: {
          auth: { handler: mockHandler, api: { getToken: mockGetToken } },
        },
      }

      const result = await (handler as (event: unknown) => Promise<unknown>)(event) as Response
      const body = await result.json()

      expect(body).toEqual({
        accessToken: 'eyJhbG.jwt.signup',
        refreshToken: 'czo_rt_new-session',
        expiresIn: 900,
      })
    })

    it('should return original response for non-auth paths', async () => {
      mockGetRouterParam.mockReturnValue('customer')
      const req = new Request('http://localhost/api/auth/customer/session', { method: 'GET' })
      const originalResponse = new Response('{"session":"data"}', { status: 200 })
      mockHandler.mockResolvedValue(originalResponse)

      const event = {
        req,
        context: {
          auth: { handler: mockHandler, api: { getToken: mockGetToken } },
        },
      }

      const result = await (handler as (event: unknown) => Promise<unknown>)(event)

      expect(result).toBe(originalResponse)
    })

    it('should return original response when status is not ok', async () => {
      mockGetRouterParam.mockReturnValue('customer')
      const errorResponse = new Response('{"error":"bad"}', { status: 401 })
      mockHandler.mockResolvedValue(errorResponse)

      const event = createEvent({ actor: 'customer' })

      const result = await (handler as (event: unknown) => Promise<unknown>)(event)

      expect(result).toBe(errorResponse)
    })

    it('should fallback to original response when getToken fails', async () => {
      mockGetRouterParam.mockReturnValue('customer')
      const sessionData = {
        session: { token: 'czo_rt_session' },
        user: { id: 'u1' },
      }
      mockHandler.mockResolvedValue(new Response(JSON.stringify(sessionData), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
      mockGetToken.mockResolvedValue(null)

      const event = createEvent({ actor: 'customer' })

      // Should not throw; falls through to return original response
      const result = await (handler as (event: unknown) => Promise<unknown>)(event)
      expect(result).toBeInstanceOf(Response)
    })

    it('should pass through twoFactorRedirect responses without transformation', async () => {
      mockGetRouterParam.mockReturnValue('customer')
      const redirectData = { twoFactorRedirect: true }
      const originalResponse = new Response(JSON.stringify(redirectData), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
      mockHandler.mockResolvedValue(originalResponse)

      const event = createEvent({ actor: 'customer' })

      const result = await (handler as (event: unknown) => Promise<unknown>)(event) as Response
      const body = await result.json()

      expect(body).toEqual({ twoFactorRedirect: true })
      expect(mockGetToken).not.toHaveBeenCalled()
    })

    it('should preserve response body after clone (no empty body bug)', async () => {
      mockGetRouterParam.mockReturnValue('customer')
      // Response without session.token — simulates non-standard 200 response
      const data = { message: 'some other response' }
      mockHandler.mockResolvedValue(new Response(JSON.stringify(data), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))

      const event = createEvent({ actor: 'customer' })

      const result = await (handler as (event: unknown) => Promise<unknown>)(event) as Response
      const body = await result.json()

      // Body should be preserved thanks to clone()
      expect(body).toEqual({ message: 'some other response' })
    })

    it('should include requiresTwoFactorSetup for admin without 2FA', async () => {
      mockGetRouterParam.mockReturnValue('admin')
      const sessionData = {
        session: { token: 'czo_rt_admin-token' },
        user: { id: 'u1', twoFactorEnabled: false },
      }
      const req = new Request('http://localhost/api/auth/admin/sign-in/email', { method: 'POST' })
      mockHandler.mockResolvedValue(new Response(JSON.stringify(sessionData), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
      mockGetToken.mockResolvedValue({ token: 'eyJhbG.jwt.admin' })

      const event = {
        req,
        context: {
          auth: { handler: mockHandler, api: { getToken: mockGetToken } },
        },
      }

      const result = await (handler as (event: unknown) => Promise<unknown>)(event) as Response
      const body = await result.json()

      expect(body).toEqual({
        accessToken: 'eyJhbG.jwt.admin',
        refreshToken: 'czo_rt_admin-token',
        expiresIn: 900,
        requiresTwoFactorSetup: true,
      })
    })

    it('should NOT include requiresTwoFactorSetup for admin with 2FA enabled', async () => {
      mockGetRouterParam.mockReturnValue('admin')
      const sessionData = {
        session: { token: 'czo_rt_admin-token' },
        user: { id: 'u1', twoFactorEnabled: true },
      }
      const req = new Request('http://localhost/api/auth/admin/sign-in/email', { method: 'POST' })
      mockHandler.mockResolvedValue(new Response(JSON.stringify(sessionData), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
      mockGetToken.mockResolvedValue({ token: 'eyJhbG.jwt.admin' })

      const event = {
        req,
        context: {
          auth: { handler: mockHandler, api: { getToken: mockGetToken } },
        },
      }

      const result = await (handler as (event: unknown) => Promise<unknown>)(event) as Response
      const body = await result.json()

      expect(body).toEqual({
        accessToken: 'eyJhbG.jwt.admin',
        refreshToken: 'czo_rt_admin-token',
        expiresIn: 900,
      })
      expect(body.requiresTwoFactorSetup).toBeUndefined()
    })

    it('should NOT include requiresTwoFactorSetup for customer actor', async () => {
      mockGetRouterParam.mockReturnValue('customer')
      const sessionData = {
        session: { token: 'czo_rt_customer-token' },
        user: { id: 'u1', twoFactorEnabled: false },
      }
      mockHandler.mockResolvedValue(new Response(JSON.stringify(sessionData), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
      mockGetToken.mockResolvedValue({ token: 'eyJhbG.jwt.customer' })

      const event = createEvent({ actor: 'customer' })

      const result = await (handler as (event: unknown) => Promise<unknown>)(event) as Response
      const body = await result.json()

      expect(body.requiresTwoFactorSetup).toBeUndefined()
    })

    it('should pass session token as authorization header to getToken', async () => {
      mockGetRouterParam.mockReturnValue('customer')
      const sessionData = {
        session: { token: 'czo_rt_my-token' },
        user: { id: 'u1' },
      }
      mockHandler.mockResolvedValue(new Response(JSON.stringify(sessionData), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
      mockGetToken.mockResolvedValue({ token: 'jwt' })

      const event = createEvent({ actor: 'customer' })

      await (handler as (event: unknown) => Promise<unknown>)(event)

      expect(mockGetToken).toHaveBeenCalledWith({
        headers: expect.any(Headers),
      })
      const headers = mockGetToken.mock.calls[0]![0].headers as Headers
      expect(headers.get('authorization')).toBe('Bearer czo_rt_my-token')
    })
  })

  describe('auto-create organization on sign-up', () => {
    const mockCreateOrganization = vi.fn()

    function createSignUpEvent(body: Record<string, unknown>) {
      const req = new Request('http://localhost/api/auth/customer/sign-up/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      return {
        req,
        context: {
          auth: {
            handler: mockHandler,
            api: { getToken: mockGetToken, createOrganization: mockCreateOrganization },
          },
        },
      }
    }

    beforeEach(() => {
      mockCreateOrganization.mockReset()
    })

    it('should call createOrganization when organizationName is provided on sign-up', async () => {
      mockGetRouterParam.mockReturnValue('customer')
      const sessionData = { session: { token: 'czo_rt_new-session' }, user: { id: 'u1' } }
      mockHandler.mockResolvedValue(new Response(JSON.stringify(sessionData), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
      mockGetToken.mockResolvedValue({ token: 'eyJhbG.jwt.signup' })
      mockCreateOrganization.mockResolvedValue({ id: 'org1', name: 'My Store', slug: 'my-store' })

      const event = createSignUpEvent({
        email: 'merchant@test.com',
        password: 'secret123',
        name: 'Merchant',
        organizationName: 'My Store',
      })

      await (handler as (event: unknown) => Promise<unknown>)(event)

      // Allow fire-and-forget promise to resolve
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(mockCreateOrganization).toHaveBeenCalledWith({
        headers: expect.any(Headers),
        body: { name: 'My Store' },
      })

      // Verify the session token is used for authorization
      const callHeaders = mockCreateOrganization.mock.calls[0]![0].headers as Headers
      expect(callHeaders.get('authorization')).toBe('Bearer czo_rt_new-session')
    })

    it('should NOT call createOrganization when organizationName is not provided', async () => {
      mockGetRouterParam.mockReturnValue('customer')
      const sessionData = { session: { token: 'czo_rt_new-session' }, user: { id: 'u1' } }
      mockHandler.mockResolvedValue(new Response(JSON.stringify(sessionData), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
      mockGetToken.mockResolvedValue({ token: 'eyJhbG.jwt.signup' })

      const event = createSignUpEvent({
        email: 'user@test.com',
        password: 'secret123',
        name: 'User',
      })

      await (handler as (event: unknown) => Promise<unknown>)(event)
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(mockCreateOrganization).not.toHaveBeenCalled()
    })

    it('should NOT call createOrganization when organizationName is empty/whitespace', async () => {
      mockGetRouterParam.mockReturnValue('customer')
      const sessionData = { session: { token: 'czo_rt_new-session' }, user: { id: 'u1' } }
      mockHandler.mockResolvedValue(new Response(JSON.stringify(sessionData), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
      mockGetToken.mockResolvedValue({ token: 'eyJhbG.jwt.signup' })

      const event = createSignUpEvent({
        email: 'user@test.com',
        password: 'secret123',
        name: 'User',
        organizationName: '   ',
      })

      await (handler as (event: unknown) => Promise<unknown>)(event)
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(mockCreateOrganization).not.toHaveBeenCalled()
    })

    it('should still return token response even if org creation fails', async () => {
      mockGetRouterParam.mockReturnValue('customer')
      const sessionData = { session: { token: 'czo_rt_new-session' }, user: { id: 'u1' } }
      mockHandler.mockResolvedValue(new Response(JSON.stringify(sessionData), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
      mockGetToken.mockResolvedValue({ token: 'eyJhbG.jwt.signup' })
      mockCreateOrganization.mockRejectedValue(new Error('Org creation failed'))

      const event = createSignUpEvent({
        email: 'merchant@test.com',
        password: 'secret123',
        name: 'Merchant',
        organizationName: 'My Store',
      })

      const result = await (handler as (event: unknown) => Promise<unknown>)(event) as Response
      const body = await result.json()

      // Sign-up still succeeds with token response
      expect(body).toEqual({
        accessToken: 'eyJhbG.jwt.signup',
        refreshToken: 'czo_rt_new-session',
        expiresIn: 900,
      })
    })

    it('should NOT call createOrganization for sign-in requests', async () => {
      mockGetRouterParam.mockReturnValue('customer')
      const sessionData = { session: { token: 'czo_rt_session' }, user: { id: 'u1' } }
      mockHandler.mockResolvedValue(new Response(JSON.stringify(sessionData), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
      mockGetToken.mockResolvedValue({ token: 'eyJhbG.jwt.signin' })

      // Sign-in request (not sign-up) with organizationName in body
      const req = new Request('http://localhost/api/auth/customer/sign-in/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'user@test.com', password: 'secret', organizationName: 'Sneaky' }),
      })
      const event = {
        req,
        context: {
          auth: {
            handler: mockHandler,
            api: { getToken: mockGetToken, createOrganization: mockCreateOrganization },
          },
        },
      }

      await (handler as (event: unknown) => Promise<unknown>)(event)
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(mockCreateOrganization).not.toHaveBeenCalled()
    })

    it('should pass organizationType when provided on sign-up', async () => {
      mockGetRouterParam.mockReturnValue('customer')
      const sessionData = { session: { token: 'czo_rt_new-session' }, user: { id: 'u1' } }
      mockHandler.mockResolvedValue(new Response(JSON.stringify(sessionData), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
      mockGetToken.mockResolvedValue({ token: 'eyJhbG.jwt.signup' })
      mockCreateOrganization.mockResolvedValue({ id: 'org1', name: 'My Store', slug: 'my-store', type: 'merchant' })

      const event = createSignUpEvent({
        email: 'merchant@test.com',
        password: 'secret123',
        name: 'Merchant',
        organizationName: 'My Store',
        organizationType: 'merchant',
      })

      await (handler as (event: unknown) => Promise<unknown>)(event)
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(mockCreateOrganization).toHaveBeenCalledWith({
        headers: expect.any(Headers),
        body: { name: 'My Store', type: 'merchant' },
      })
    })

    it('should NOT include type in body when organizationType is not provided', async () => {
      mockGetRouterParam.mockReturnValue('customer')
      const sessionData = { session: { token: 'czo_rt_new-session' }, user: { id: 'u1' } }
      mockHandler.mockResolvedValue(new Response(JSON.stringify(sessionData), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
      mockGetToken.mockResolvedValue({ token: 'eyJhbG.jwt.signup' })
      mockCreateOrganization.mockResolvedValue({ id: 'org1', name: 'My Store', slug: 'my-store' })

      const event = createSignUpEvent({
        email: 'merchant@test.com',
        password: 'secret123',
        name: 'Merchant',
        organizationName: 'My Store',
      })

      await (handler as (event: unknown) => Promise<unknown>)(event)
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(mockCreateOrganization).toHaveBeenCalledWith({
        headers: expect.any(Headers),
        body: { name: 'My Store' },
      })
    })

    it('should trim organizationName before creating organization', async () => {
      mockGetRouterParam.mockReturnValue('customer')
      const sessionData = { session: { token: 'czo_rt_new-session' }, user: { id: 'u1' } }
      mockHandler.mockResolvedValue(new Response(JSON.stringify(sessionData), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
      mockGetToken.mockResolvedValue({ token: 'eyJhbG.jwt.signup' })
      mockCreateOrganization.mockResolvedValue({ id: 'org1', name: 'My Store', slug: 'my-store' })

      const event = createSignUpEvent({
        email: 'merchant@test.com',
        password: 'secret123',
        name: 'Merchant',
        organizationName: '  My Store  ',
      })

      await (handler as (event: unknown) => Promise<unknown>)(event)
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(mockCreateOrganization).toHaveBeenCalledWith(
        expect.objectContaining({ body: { name: 'My Store' } }),
      )
    })
  })
})
