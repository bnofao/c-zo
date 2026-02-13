import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetRouterParam = vi.hoisted(() => vi.fn())
const mockGetCookie = vi.hoisted(() => vi.fn())
const mockDeleteCookie = vi.hoisted(() => vi.fn())

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

const mockRunWithSessionContext = vi.hoisted(() =>
  vi.fn((_data: unknown, fn: () => unknown) => fn()),
)

const mockVerifyActorValue = vi.hoisted(() => vi.fn())

vi.mock('nitro/h3', () => ({
  defineHandler: (fn: (event: unknown) => Promise<unknown>) => fn,
  getRouterParam: mockGetRouterParam,
  HTTPError: MockHTTPError,
  getCookie: mockGetCookie,
  deleteCookie: mockDeleteCookie,
}))

vi.mock('../../../services/oauth-providers', () => ({
  SUPPORTED_PROVIDERS: ['google', 'github'],
  isProviderAllowedForActor: (provider: string, actor: string) => {
    const map: Record<string, string[]> = {
      customer: ['google'],
      admin: ['github'],
    }
    return map[actor]?.includes(provider) ?? false
  },
}))

vi.mock('../../../services/oauth-state', () => ({
  OAUTH_ACTOR_COOKIE: 'czo_oauth_actor',
  verifyActorValue: mockVerifyActorValue,
}))

vi.mock('../../../services/session-context', () => ({
  runWithSessionContext: mockRunWithSessionContext,
}))

// eslint-disable-next-line import/first
import handler from './[provider].get'

describe('oauth callback route', () => {
  const mockHandler = vi.fn()

  function createEvent(overrides?: {
    auth?: unknown
    authSecret?: unknown
    provider?: string
  }) {
    const provider = overrides?.provider ?? 'google'
    const req = new Request(`http://localhost/api/auth/callback/${provider}?code=abc&state=xyz`)
    return {
      req,
      context: {
        auth: overrides?.auth !== undefined
          ? overrides.auth
          : { handler: mockHandler },
        authSecret: overrides?.authSecret !== undefined
          ? overrides.authSecret
          : 'test-secret-key-32-chars-minimum!',
      },
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should throw 500 if auth is not in context', async () => {
    mockGetRouterParam.mockReturnValue('google')
    const event = createEvent({ auth: null })

    const err = await (handler as (event: unknown) => Promise<unknown>)(event)
      .catch((e: unknown) => e) as InstanceType<typeof MockHTTPError>

    expect(err).toBeInstanceOf(MockHTTPError)
    expect(err.status).toBe(500)
  })

  it('should throw 500 if authSecret is not in context', async () => {
    mockGetRouterParam.mockReturnValue('google')
    const event = createEvent({ authSecret: null })

    const err = await (handler as (event: unknown) => Promise<unknown>)(event)
      .catch((e: unknown) => e) as InstanceType<typeof MockHTTPError>

    expect(err).toBeInstanceOf(MockHTTPError)
    expect(err.status).toBe(500)
  })

  it('should throw 400 for unsupported provider', async () => {
    mockGetRouterParam.mockReturnValue('twitter')
    const event = createEvent({ provider: 'twitter' })

    const err = await (handler as (event: unknown) => Promise<unknown>)(event)
      .catch((e: unknown) => e) as InstanceType<typeof MockHTTPError>

    expect(err).toBeInstanceOf(MockHTTPError)
    expect(err.status).toBe(400)
    expect(err.statusText).toContain('Unsupported provider')
  })

  it('should throw 403 when cookie is missing', async () => {
    mockGetRouterParam.mockReturnValue('google')
    mockGetCookie.mockReturnValue(undefined)
    const event = createEvent()

    const err = await (handler as (event: unknown) => Promise<unknown>)(event)
      .catch((e: unknown) => e) as InstanceType<typeof MockHTTPError>

    expect(err).toBeInstanceOf(MockHTTPError)
    expect(err.status).toBe(403)
    expect(err.statusText).toContain('Missing OAuth actor cookie')
  })

  it('should throw 403 when cookie HMAC is invalid (tampered)', async () => {
    mockGetRouterParam.mockReturnValue('google')
    mockGetCookie.mockReturnValue('customer.tampered')
    mockVerifyActorValue.mockReturnValue(null)
    const event = createEvent()

    const err = await (handler as (event: unknown) => Promise<unknown>)(event)
      .catch((e: unknown) => e) as InstanceType<typeof MockHTTPError>

    expect(err).toBeInstanceOf(MockHTTPError)
    expect(err.status).toBe(403)
    expect(err.statusText).toContain('Invalid or tampered')
  })

  it('should throw 403 when provider is not allowed for actor', async () => {
    mockGetRouterParam.mockReturnValue('google')
    mockGetCookie.mockReturnValue('admin.valid')
    mockVerifyActorValue.mockReturnValue('admin')
    const event = createEvent()

    const err = await (handler as (event: unknown) => Promise<unknown>)(event)
      .catch((e: unknown) => e) as InstanceType<typeof MockHTTPError>

    expect(err).toBeInstanceOf(MockHTTPError)
    expect(err.status).toBe(403)
    expect(err.statusText).toContain('not allowed for actor admin')
  })

  it('should delete cookie on valid callback', async () => {
    mockGetRouterParam.mockReturnValue('google')
    mockGetCookie.mockReturnValue('customer.valid')
    mockVerifyActorValue.mockReturnValue('customer')
    mockHandler.mockResolvedValue(new Response('redirect', { status: 302 }))
    const event = createEvent()

    await (handler as (event: unknown) => Promise<unknown>)(event)

    expect(mockDeleteCookie).toHaveBeenCalledWith(
      event,
      'czo_oauth_actor',
      { path: '/api/auth' },
    )
  })

  it('should call runWithSessionContext with correct data', async () => {
    mockGetRouterParam.mockReturnValue('google')
    mockGetCookie.mockReturnValue('customer.valid')
    mockVerifyActorValue.mockReturnValue('customer')
    mockHandler.mockResolvedValue(new Response('redirect', { status: 302 }))
    const event = createEvent()

    await (handler as (event: unknown) => Promise<unknown>)(event)

    expect(mockRunWithSessionContext).toHaveBeenCalledWith(
      { actorType: 'customer', authMethod: 'oauth:google' },
      expect.any(Function),
    )
  })

  it('should delegate to auth.handler with the original request', async () => {
    mockGetRouterParam.mockReturnValue('google')
    mockGetCookie.mockReturnValue('customer.valid')
    mockVerifyActorValue.mockReturnValue('customer')
    const mockResponse = new Response('redirect', { status: 302 })
    mockHandler.mockResolvedValue(mockResponse)
    const event = createEvent()

    const result = await (handler as (event: unknown) => Promise<unknown>)(event)

    expect(mockHandler).toHaveBeenCalledWith(event.req)
    expect(result).toBe(mockResponse)
  })

  it('should verify cookie with authSecret', async () => {
    mockGetRouterParam.mockReturnValue('google')
    mockGetCookie.mockReturnValue('customer.hmac-value')
    mockVerifyActorValue.mockReturnValue('customer')
    mockHandler.mockResolvedValue(new Response('redirect', { status: 302 }))
    const event = createEvent()

    await (handler as (event: unknown) => Promise<unknown>)(event)

    expect(mockVerifyActorValue).toHaveBeenCalledWith(
      'customer.hmac-value',
      'test-secret-key-32-chars-minimum!',
    )
  })

  it('should work for admin + github callback', async () => {
    mockGetRouterParam.mockReturnValue('github')
    mockGetCookie.mockReturnValue('admin.valid')
    mockVerifyActorValue.mockReturnValue('admin')
    mockHandler.mockResolvedValue(new Response('redirect', { status: 302 }))
    const event = createEvent({ provider: 'github' })

    await (handler as (event: unknown) => Promise<unknown>)(event)

    expect(mockRunWithSessionContext).toHaveBeenCalledWith(
      { actorType: 'admin', authMethod: 'oauth:github' },
      expect.any(Function),
    )
  })

  it('should throw 400 when provider param is undefined', async () => {
    mockGetRouterParam.mockReturnValue(undefined)
    const event = createEvent()

    const err = await (handler as (event: unknown) => Promise<unknown>)(event)
      .catch((e: unknown) => e) as InstanceType<typeof MockHTTPError>

    expect(err).toBeInstanceOf(MockHTTPError)
    expect(err.status).toBe(400)
  })
})
