import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetRouterParam = vi.hoisted(() => vi.fn())
const mockReadBody = vi.hoisted(() => vi.fn())
const mockSetCookie = vi.hoisted(() => vi.fn())

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

const mockSignActorValue = vi.hoisted(() => vi.fn(() => 'customer.signed'))

vi.mock('nitro/h3', () => ({
  defineHandler: (fn: (event: unknown) => Promise<unknown>) => fn,
  getRouterParam: mockGetRouterParam,
  HTTPError: MockHTTPError,
  readBody: mockReadBody,
  setCookie: mockSetCookie,
}))

vi.mock('../[...all]', () => ({
  VALID_ACTORS: ['customer', 'admin'],
}))

vi.mock('../../../../services/oauth-providers', () => ({
  SUPPORTED_PROVIDERS: ['google', 'github'],
  isProviderAllowedForActor: (provider: string, actor: string) => {
    const map: Record<string, string[]> = {
      customer: ['google'],
      admin: ['github'],
    }
    return map[actor]?.includes(provider) ?? false
  },
}))

vi.mock('../../../../services/oauth-state', () => ({
  OAUTH_ACTOR_COOKIE: 'czo_oauth_actor',
  COOKIE_MAX_AGE: 300,
  signActorValue: mockSignActorValue,
}))

vi.mock('../../../../services/session-context', () => ({
  runWithSessionContext: mockRunWithSessionContext,
}))

// eslint-disable-next-line import/first
import handler from './social.post'

describe('social sign-in route', () => {
  const mockHandler = vi.fn()

  function createEvent(overrides?: {
    auth?: unknown
    authSecret?: unknown
    actor?: string
  }) {
    const actor = overrides?.actor ?? 'customer'
    const req = new Request(`http://localhost/api/auth/${actor}/sign-in/social`, {
      method: 'POST',
    })
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
    mockGetRouterParam.mockReturnValue('customer')
    const event = createEvent({ auth: null })

    const err = await (handler as (event: unknown) => Promise<unknown>)(event)
      .catch((e: unknown) => e) as InstanceType<typeof MockHTTPError>

    expect(err).toBeInstanceOf(MockHTTPError)
    expect(err.status).toBe(500)
    expect(err.statusText).toContain('Auth instance')
  })

  it('should throw 500 if authSecret is not in context', async () => {
    mockGetRouterParam.mockReturnValue('customer')
    const event = createEvent({ authSecret: null })

    const err = await (handler as (event: unknown) => Promise<unknown>)(event)
      .catch((e: unknown) => e) as InstanceType<typeof MockHTTPError>

    expect(err).toBeInstanceOf(MockHTTPError)
    expect(err.status).toBe(500)
    expect(err.statusText).toContain('Auth secret')
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

  it('should throw 400 when provider is missing from body', async () => {
    mockGetRouterParam.mockReturnValue('customer')
    mockReadBody.mockResolvedValue({})
    const event = createEvent()

    const err = await (handler as (event: unknown) => Promise<unknown>)(event)
      .catch((e: unknown) => e) as InstanceType<typeof MockHTTPError>

    expect(err).toBeInstanceOf(MockHTTPError)
    expect(err.status).toBe(400)
    expect(err.statusText).toContain('Missing required field: provider')
  })

  it('should throw 400 when body is null', async () => {
    mockGetRouterParam.mockReturnValue('customer')
    mockReadBody.mockResolvedValue(null)
    const event = createEvent()

    const err = await (handler as (event: unknown) => Promise<unknown>)(event)
      .catch((e: unknown) => e) as InstanceType<typeof MockHTTPError>

    expect(err).toBeInstanceOf(MockHTTPError)
    expect(err.status).toBe(400)
  })

  it('should throw 400 for unsupported provider', async () => {
    mockGetRouterParam.mockReturnValue('customer')
    mockReadBody.mockResolvedValue({ provider: 'twitter' })
    const event = createEvent()

    const err = await (handler as (event: unknown) => Promise<unknown>)(event)
      .catch((e: unknown) => e) as InstanceType<typeof MockHTTPError>

    expect(err).toBeInstanceOf(MockHTTPError)
    expect(err.status).toBe(400)
    expect(err.statusText).toContain('Unsupported provider: twitter')
  })

  it('should throw 403 when provider is not allowed for actor', async () => {
    mockGetRouterParam.mockReturnValue('customer')
    mockReadBody.mockResolvedValue({ provider: 'github' })
    const event = createEvent()

    const err = await (handler as (event: unknown) => Promise<unknown>)(event)
      .catch((e: unknown) => e) as InstanceType<typeof MockHTTPError>

    expect(err).toBeInstanceOf(MockHTTPError)
    expect(err.status).toBe(403)
    expect(err.statusText).toContain('not allowed for actor customer')
  })

  it('should throw 403 when admin tries to use google', async () => {
    mockGetRouterParam.mockReturnValue('admin')
    mockReadBody.mockResolvedValue({ provider: 'google' })
    const event = createEvent({ actor: 'admin' })

    const err = await (handler as (event: unknown) => Promise<unknown>)(event)
      .catch((e: unknown) => e) as InstanceType<typeof MockHTTPError>

    expect(err).toBeInstanceOf(MockHTTPError)
    expect(err.status).toBe(403)
  })

  it('should set signed cookie for valid customer + google', async () => {
    mockGetRouterParam.mockReturnValue('customer')
    mockReadBody.mockResolvedValue({ provider: 'google' })
    mockHandler.mockResolvedValue(new Response('{}', { status: 302 }))
    const event = createEvent()

    await (handler as (event: unknown) => Promise<unknown>)(event)

    expect(mockSignActorValue).toHaveBeenCalledWith('customer', 'test-secret-key-32-chars-minimum!')
    expect(mockSetCookie).toHaveBeenCalledWith(
      event,
      'czo_oauth_actor',
      'customer.signed',
      {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 300,
        path: '/api/auth',
      },
    )
  })

  it('should rewrite URL to strip actor segment', async () => {
    mockGetRouterParam.mockReturnValue('customer')
    mockReadBody.mockResolvedValue({ provider: 'google' })
    mockHandler.mockResolvedValue(new Response('{}', { status: 302 }))
    const event = createEvent()

    await (handler as (event: unknown) => Promise<unknown>)(event)

    expect(mockHandler).toHaveBeenCalled()
    const calledReq = mockHandler.mock.calls[0]![0] as Request
    const url = new URL(calledReq.url)
    expect(url.pathname).toBe('/api/auth/sign-in/social')
  })

  it('should call runWithSessionContext with correct actor and authMethod', async () => {
    mockGetRouterParam.mockReturnValue('customer')
    mockReadBody.mockResolvedValue({ provider: 'google' })
    mockHandler.mockResolvedValue(new Response('{}', { status: 302 }))
    const event = createEvent()

    await (handler as (event: unknown) => Promise<unknown>)(event)

    expect(mockRunWithSessionContext).toHaveBeenCalledWith(
      { actorType: 'customer', authMethod: 'oauth:google' },
      expect.any(Function),
    )
  })

  it('should delegate to auth.handler and return its response', async () => {
    mockGetRouterParam.mockReturnValue('customer')
    mockReadBody.mockResolvedValue({ provider: 'google' })
    const mockResponse = new Response('redirect', { status: 302 })
    mockHandler.mockResolvedValue(mockResponse)
    const event = createEvent()

    const result = await (handler as (event: unknown) => Promise<unknown>)(event)

    expect(result).toBe(mockResponse)
  })

  it('should work for admin + github', async () => {
    mockGetRouterParam.mockReturnValue('admin')
    mockReadBody.mockResolvedValue({ provider: 'github' })
    mockHandler.mockResolvedValue(new Response('{}', { status: 302 }))
    const event = createEvent({ actor: 'admin' })

    await (handler as (event: unknown) => Promise<unknown>)(event)

    expect(mockRunWithSessionContext).toHaveBeenCalledWith(
      { actorType: 'admin', authMethod: 'oauth:github' },
      expect.any(Function),
    )

    const calledReq = mockHandler.mock.calls[0]![0] as Request
    const url = new URL(calledReq.url)
    expect(url.pathname).toBe('/api/auth/sign-in/social')
  })
})
