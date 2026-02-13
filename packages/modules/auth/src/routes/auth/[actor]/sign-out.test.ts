import { Buffer } from 'node:buffer'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetRouterParam = vi.hoisted(() => vi.fn())

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

vi.mock('./[...all]', () => ({
  VALID_ACTORS: ['customer', 'admin'],
}))

// eslint-disable-next-line import/first
import handler from './sign-out.post'

describe('sign-out route', () => {
  const mockGetToken = vi.fn()
  const mockHandler = vi.fn()
  const mockBlocklistAdd = vi.fn()
  const mockSessionRevoked = vi.fn()

  function createEvent(overrides?: {
    auth?: unknown
    blocklist?: unknown
    authEvents?: unknown
    actor?: string
  }) {
    const actor = overrides?.actor ?? 'customer'
    const req = new Request(`http://localhost/api/auth/${actor}/sign-out`, {
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
        ...(overrides?.blocklist !== undefined
          ? { blocklist: overrides.blocklist }
          : {}),
        ...(overrides?.authEvents !== undefined
          ? { authEvents: overrides.authEvents }
          : {}),
      },
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should throw 500 if auth is not in context', async () => {
    mockGetRouterParam.mockReturnValue('customer')
    const event = createEvent({ auth: null })

    const err = await (handler as (event: unknown) => Promise<unknown>)(event)
      .catch((e: unknown) => e) as InstanceType<typeof MockHTTPError>

    expect(err).toBeInstanceOf(MockHTTPError)
    expect(err.status).toBe(500)
  })

  it('should throw 400 for invalid actor', async () => {
    mockGetRouterParam.mockReturnValue('hacker')
    const event = createEvent({ actor: 'hacker' })

    const err = await (handler as (event: unknown) => Promise<unknown>)(event)
      .catch((e: unknown) => e) as InstanceType<typeof MockHTTPError>

    expect(err).toBeInstanceOf(MockHTTPError)
    expect(err.status).toBe(400)
    expect(err.statusText).toContain('Invalid actor')
  })

  it('should call auth.handler with rewritten URL', async () => {
    mockGetRouterParam.mockReturnValue('customer')
    mockHandler.mockResolvedValue(new Response('{}', { status: 200 }))
    const event = createEvent()

    await (handler as (event: unknown) => Promise<unknown>)(event)

    expect(mockHandler).toHaveBeenCalled()
    const calledReq = mockHandler.mock.calls[0]![0] as Request
    const url = new URL(calledReq.url)
    expect(url.pathname).toBe('/api/auth/sign-out')
  })

  it('should blocklist JWT jti when blocklist is available', async () => {
    mockGetRouterParam.mockReturnValue('customer')
    mockHandler.mockResolvedValue(new Response('{}', { status: 200 }))

    // Create a fake JWT with jti claim
    const payload = Buffer.from(JSON.stringify({ jti: 'jwt-123', sub: 'u1' })).toString('base64url')
    const fakeJwt = `eyJhbGciOiJFUzI1NiJ9.${payload}.signature`
    mockGetToken.mockResolvedValue({ token: fakeJwt })

    const blocklist = { add: mockBlocklistAdd, isBlocked: vi.fn() }
    const event = createEvent({ blocklist })

    await (handler as (event: unknown) => Promise<unknown>)(event)

    expect(mockBlocklistAdd).toHaveBeenCalledWith('jwt-123', 900)
  })

  it('should not fail when blocklist is not available', async () => {
    mockGetRouterParam.mockReturnValue('customer')
    mockHandler.mockResolvedValue(new Response('{}', { status: 200 }))
    const event = createEvent()

    const result = await (handler as (event: unknown) => Promise<unknown>)(event)

    expect(result).toBeInstanceOf(Response)
    expect(mockBlocklistAdd).not.toHaveBeenCalled()
  })

  it('should not fail when getToken throws', async () => {
    mockGetRouterParam.mockReturnValue('customer')
    mockHandler.mockResolvedValue(new Response('{}', { status: 200 }))
    mockGetToken.mockRejectedValue(new Error('No session'))

    const blocklist = { add: mockBlocklistAdd, isBlocked: vi.fn() }
    const event = createEvent({ blocklist })

    const result = await (handler as (event: unknown) => Promise<unknown>)(event)

    expect(result).toBeInstanceOf(Response)
    expect(mockBlocklistAdd).not.toHaveBeenCalled()
  })

  it('should not fail when getToken returns no token', async () => {
    mockGetRouterParam.mockReturnValue('customer')
    mockHandler.mockResolvedValue(new Response('{}', { status: 200 }))
    mockGetToken.mockResolvedValue(null)

    const blocklist = { add: mockBlocklistAdd, isBlocked: vi.fn() }
    const event = createEvent({ blocklist })

    const result = await (handler as (event: unknown) => Promise<unknown>)(event)

    expect(result).toBeInstanceOf(Response)
    expect(mockBlocklistAdd).not.toHaveBeenCalled()
  })

  it('should not fail when JWT has no jti claim', async () => {
    mockGetRouterParam.mockReturnValue('customer')
    mockHandler.mockResolvedValue(new Response('{}', { status: 200 }))

    const payload = Buffer.from(JSON.stringify({ sub: 'u1' })).toString('base64url')
    const fakeJwt = `eyJhbGciOiJFUzI1NiJ9.${payload}.signature`
    mockGetToken.mockResolvedValue({ token: fakeJwt })

    const blocklist = { add: mockBlocklistAdd, isBlocked: vi.fn() }
    const event = createEvent({ blocklist })

    const result = await (handler as (event: unknown) => Promise<unknown>)(event)

    expect(result).toBeInstanceOf(Response)
    expect(mockBlocklistAdd).not.toHaveBeenCalled()
  })

  it('should strip admin actor from URL when signing out as admin', async () => {
    mockGetRouterParam.mockReturnValue('admin')
    mockHandler.mockResolvedValue(new Response('{}', { status: 200 }))
    const req = new Request('http://localhost/api/auth/admin/sign-out', { method: 'POST' })
    const event = {
      req,
      context: {
        auth: { handler: mockHandler, api: { getToken: mockGetToken } },
      },
    }

    await (handler as (event: unknown) => Promise<unknown>)(event)

    const calledReq = mockHandler.mock.calls[0]![0] as Request
    const url = new URL(calledReq.url)
    expect(url.pathname).toBe('/api/auth/sign-out')
  })

  describe('session.revoked event', () => {
    it('should emit sessionRevoked when JWT has sub and jti', async () => {
      mockGetRouterParam.mockReturnValue('customer')
      mockHandler.mockResolvedValue(new Response('{}', { status: 200 }))

      const payload = Buffer.from(JSON.stringify({ jti: 'jwt-456', sub: 'u1' })).toString('base64url')
      const fakeJwt = `eyJhbGciOiJFUzI1NiJ9.${payload}.signature`
      mockGetToken.mockResolvedValue({ token: fakeJwt })

      const blocklist = { add: mockBlocklistAdd, isBlocked: vi.fn() }
      const authEvents = { sessionRevoked: mockSessionRevoked }
      const event = createEvent({ blocklist, authEvents })

      await (handler as (event: unknown) => Promise<unknown>)(event)

      expect(mockSessionRevoked).toHaveBeenCalledWith({
        jwtId: 'jwt-456',
        userId: 'u1',
        reason: 'user_initiated',
      })
    })

    it('should not emit sessionRevoked when JWT claims are missing', async () => {
      mockGetRouterParam.mockReturnValue('customer')
      mockHandler.mockResolvedValue(new Response('{}', { status: 200 }))
      mockGetToken.mockResolvedValue(null)

      const blocklist = { add: mockBlocklistAdd, isBlocked: vi.fn() }
      const authEvents = { sessionRevoked: mockSessionRevoked }
      const event = createEvent({ blocklist, authEvents })

      await (handler as (event: unknown) => Promise<unknown>)(event)

      expect(mockSessionRevoked).not.toHaveBeenCalled()
    })

    it('should not emit sessionRevoked when authEvents is not in context', async () => {
      mockGetRouterParam.mockReturnValue('customer')
      mockHandler.mockResolvedValue(new Response('{}', { status: 200 }))

      const payload = Buffer.from(JSON.stringify({ jti: 'jwt-789', sub: 'u1' })).toString('base64url')
      const fakeJwt = `eyJhbGciOiJFUzI1NiJ9.${payload}.signature`
      mockGetToken.mockResolvedValue({ token: fakeJwt })

      const blocklist = { add: mockBlocklistAdd, isBlocked: vi.fn() }
      const event = createEvent({ blocklist })

      await expect(
        (handler as (event: unknown) => Promise<unknown>)(event),
      ).resolves.toBeDefined()

      expect(mockSessionRevoked).not.toHaveBeenCalled()
    })

    it('should not emit sessionRevoked when blocklist decoding fails', async () => {
      mockGetRouterParam.mockReturnValue('customer')
      mockHandler.mockResolvedValue(new Response('{}', { status: 200 }))
      mockGetToken.mockRejectedValue(new Error('No session'))

      const blocklist = { add: mockBlocklistAdd, isBlocked: vi.fn() }
      const authEvents = { sessionRevoked: mockSessionRevoked }
      const event = createEvent({ blocklist, authEvents })

      await (handler as (event: unknown) => Promise<unknown>)(event)

      expect(mockSessionRevoked).not.toHaveBeenCalled()
    })
  })
})
