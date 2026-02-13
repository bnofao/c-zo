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

vi.mock('../../../../config/auth.config', () => ({
  JWT_EXPIRATION_SECONDS: 900,
}))

vi.mock('../../../../services/session-context', () => ({
  runWithSessionContext: mockRunWithSessionContext,
}))

vi.mock('../[...all]', () => ({
  VALID_ACTORS: ['customer', 'admin'] as const,
}))

// eslint-disable-next-line import/first
import verifyBackupHandler from './verify-backup.post'
// eslint-disable-next-line import/first
import verifyHandler from './verify.post'

describe('two-factor verify handler', () => {
  const mockGetToken = vi.fn()
  const mockHandler = vi.fn()

  function createEvent(actor = 'customer') {
    const req = new Request(`http://localhost/api/auth/${actor}/two-factor/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: '123456' }),
    })
    return {
      req,
      context: {
        auth: {
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
    it('should reject invalid actor with 400', async () => {
      mockGetRouterParam.mockReturnValue('hacker')
      const event = createEvent('hacker')

      const err = await (verifyHandler as (event: unknown) => Promise<unknown>)(event)
        .catch((e: unknown) => e) as InstanceType<typeof MockHTTPError>

      expect(err).toBeInstanceOf(MockHTTPError)
      expect(err.status).toBe(400)
    })

    it('should throw 500 when auth is not in context', async () => {
      mockGetRouterParam.mockReturnValue('customer')
      const event = { req: new Request('http://localhost/api/auth/customer/two-factor/verify', { method: 'POST' }), context: { auth: null } }

      const err = await (verifyHandler as (event: unknown) => Promise<unknown>)(event)
        .catch((e: unknown) => e) as InstanceType<typeof MockHTTPError>

      expect(err).toBeInstanceOf(MockHTTPError)
      expect(err.status).toBe(500)
    })
  })

  describe('url rewriting', () => {
    it('should rewrite verify URL to /api/auth/two-factor/verify-totp', async () => {
      mockGetRouterParam.mockReturnValue('customer')
      mockHandler.mockResolvedValue(new Response('{}', { status: 200 }))
      const event = createEvent()

      await (verifyHandler as (event: unknown) => Promise<unknown>)(event)

      const calledReq = mockHandler.mock.calls[0]![0] as Request
      const url = new URL(calledReq.url)
      expect(url.pathname).toBe('/api/auth/two-factor/verify-totp')
    })

    it('should rewrite backup URL to /api/auth/two-factor/verify-backup-code', async () => {
      mockGetRouterParam.mockReturnValue('customer')
      mockHandler.mockResolvedValue(new Response('{}', { status: 200 }))
      const event = createEvent()

      await (verifyBackupHandler as (event: unknown) => Promise<unknown>)(event)

      const calledReq = mockHandler.mock.calls[0]![0] as Request
      const url = new URL(calledReq.url)
      expect(url.pathname).toBe('/api/auth/two-factor/verify-backup-code')
    })
  })

  describe('session context', () => {
    it('should use totp as authMethod in session context', async () => {
      mockGetRouterParam.mockReturnValue('customer')
      mockHandler.mockResolvedValue(new Response('{}', { status: 200 }))
      const event = createEvent()

      await (verifyHandler as (event: unknown) => Promise<unknown>)(event)

      expect(mockRunWithSessionContext).toHaveBeenCalledWith(
        { actorType: 'customer', authMethod: 'totp' },
        expect.any(Function),
      )
    })

    it('should propagate admin actor type', async () => {
      mockGetRouterParam.mockReturnValue('admin')
      mockHandler.mockResolvedValue(new Response('{}', { status: 200 }))
      const event = createEvent('admin')

      await (verifyHandler as (event: unknown) => Promise<unknown>)(event)

      expect(mockRunWithSessionContext).toHaveBeenCalledWith(
        { actorType: 'admin', authMethod: 'totp' },
        expect.any(Function),
      )
    })
  })

  describe('response transformation', () => {
    it('should transform { token } response to dual-token format', async () => {
      mockGetRouterParam.mockReturnValue('customer')
      const verifyData = { token: 'czo_rt_verified-session' }
      mockHandler.mockResolvedValue(new Response(JSON.stringify(verifyData), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
      mockGetToken.mockResolvedValue({ token: 'eyJhbG.jwt.verified' })

      const event = createEvent()
      const result = await (verifyHandler as (event: unknown) => Promise<unknown>)(event) as Response
      const body = await result.json()

      expect(body).toEqual({
        accessToken: 'eyJhbG.jwt.verified',
        refreshToken: 'czo_rt_verified-session',
        expiresIn: 900,
      })
    })

    it('should handle { session: { token } } response shape', async () => {
      mockGetRouterParam.mockReturnValue('customer')
      const verifyData = { session: { token: 'czo_rt_session-token' }, user: { id: 'u1' } }
      mockHandler.mockResolvedValue(new Response(JSON.stringify(verifyData), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
      mockGetToken.mockResolvedValue({ token: 'eyJhbG.jwt.session' })

      const event = createEvent()
      const result = await (verifyHandler as (event: unknown) => Promise<unknown>)(event) as Response
      const body = await result.json()

      expect(body).toEqual({
        accessToken: 'eyJhbG.jwt.session',
        refreshToken: 'czo_rt_session-token',
        expiresIn: 900,
      })
    })

    it('should pass error responses through unchanged', async () => {
      mockGetRouterParam.mockReturnValue('customer')
      const errorResponse = new Response(JSON.stringify({ error: 'Invalid code' }), { status: 401 })
      mockHandler.mockResolvedValue(errorResponse)

      const event = createEvent()
      const result = await (verifyHandler as (event: unknown) => Promise<unknown>)(event)

      expect(result).toBe(errorResponse)
      expect(mockGetToken).not.toHaveBeenCalled()
    })

    it('should fallback to original response when getToken returns null', async () => {
      mockGetRouterParam.mockReturnValue('customer')
      const verifyData = { token: 'czo_rt_session' }
      mockHandler.mockResolvedValue(new Response(JSON.stringify(verifyData), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
      mockGetToken.mockResolvedValue(null)

      const event = createEvent()
      const result = await (verifyHandler as (event: unknown) => Promise<unknown>)(event) as Response

      expect(result).toBeInstanceOf(Response)
    })

    it('should pass session token as authorization header to getToken', async () => {
      mockGetRouterParam.mockReturnValue('customer')
      const verifyData = { token: 'czo_rt_my-token' }
      mockHandler.mockResolvedValue(new Response(JSON.stringify(verifyData), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
      mockGetToken.mockResolvedValue({ token: 'jwt' })

      const event = createEvent()
      await (verifyHandler as (event: unknown) => Promise<unknown>)(event)

      const headers = mockGetToken.mock.calls[0]![0].headers as Headers
      expect(headers.get('authorization')).toBe('Bearer czo_rt_my-token')
    })
  })

  describe('backup code verify', () => {
    it('should transform backup code verify response to dual-token format', async () => {
      mockGetRouterParam.mockReturnValue('customer')
      const verifyData = { token: 'czo_rt_backup-session' }
      mockHandler.mockResolvedValue(new Response(JSON.stringify(verifyData), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
      mockGetToken.mockResolvedValue({ token: 'eyJhbG.jwt.backup' })

      const event = createEvent()
      const result = await (verifyBackupHandler as (event: unknown) => Promise<unknown>)(event) as Response
      const body = await result.json()

      expect(body).toEqual({
        accessToken: 'eyJhbG.jwt.backup',
        refreshToken: 'czo_rt_backup-session',
        expiresIn: 900,
      })
    })
  })
})
