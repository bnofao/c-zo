import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockReadBody = vi.hoisted(() => vi.fn())

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
  readBody: mockReadBody,
  HTTPError: MockHTTPError,
}))

vi.mock('../../../config/auth.config', () => ({
  JWT_EXPIRATION_SECONDS: 900,
}))

// eslint-disable-next-line import/first
import handler from './refresh.post'

describe('token refresh endpoint', () => {
  const mockGetSession = vi.fn()
  const mockGetToken = vi.fn()

  const createEvent = (authOverride?: unknown) => ({
    context: {
      auth: authOverride !== undefined
        ? authOverride
        : {
            api: {
              getSession: mockGetSession,
              getToken: mockGetToken,
            },
          },
    },
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return 400 when refreshToken is missing', async () => {
    mockReadBody.mockResolvedValue({})
    const event = createEvent()

    const err = await (handler as (event: unknown) => Promise<unknown>)(event).catch((e: unknown) => e) as InstanceType<typeof MockHTTPError>
    expect(err).toBeInstanceOf(MockHTTPError)
    expect(err.status).toBe(400)
  })

  it('should return 400 when body is null', async () => {
    mockReadBody.mockResolvedValue(null)
    const event = createEvent()

    await expect((handler as (event: unknown) => Promise<unknown>)(event)).rejects.toThrow('refreshToken is required')
  })

  it('should return 401 when session is invalid', async () => {
    mockReadBody.mockResolvedValue({ refreshToken: 'invalid-token' })
    mockGetSession.mockResolvedValue(null)
    const event = createEvent()

    const err = await (handler as (event: unknown) => Promise<unknown>)(event).catch((e: unknown) => e) as InstanceType<typeof MockHTTPError>
    expect(err).toBeInstanceOf(MockHTTPError)
    expect(err.status).toBe(401)
  })

  it('should return 401 when token generation fails', async () => {
    mockReadBody.mockResolvedValue({ refreshToken: 'valid-token' })
    mockGetSession.mockResolvedValue({ session: { id: 's1' }, user: { id: 'u1' } })
    mockGetToken.mockResolvedValue(null)
    const event = createEvent()

    await expect((handler as (event: unknown) => Promise<unknown>)(event)).rejects.toThrow('Failed to generate token')
  })

  it('should return new access token on valid refresh', async () => {
    mockReadBody.mockResolvedValue({ refreshToken: 'valid-token' })
    mockGetSession.mockResolvedValue({ session: { id: 's1' }, user: { id: 'u1' } })
    mockGetToken.mockResolvedValue({ token: 'new-jwt-token' })
    const event = createEvent()

    const result = await (handler as (event: unknown) => Promise<unknown>)(event)

    expect(result).toEqual({
      accessToken: 'new-jwt-token',
      tokenType: 'Bearer',
      expiresIn: 900,
    })
  })

  it('should pass refresh token as authorization header to getSession', async () => {
    mockReadBody.mockResolvedValue({ refreshToken: 'my-refresh-token' })
    mockGetSession.mockResolvedValue({ session: { id: 's1' }, user: { id: 'u1' } })
    mockGetToken.mockResolvedValue({ token: 'jwt' })
    const event = createEvent()

    await (handler as (event: unknown) => Promise<unknown>)(event)

    expect(mockGetSession).toHaveBeenCalledWith({
      headers: expect.any(Headers),
    })

    const headers = mockGetSession.mock.calls[0]![0].headers as Headers
    expect(headers.get('authorization')).toBe('Bearer my-refresh-token')
  })

  it('should throw 500 when auth is not in context', async () => {
    mockReadBody.mockResolvedValue({ refreshToken: 'token' })
    const event = createEvent(null)

    const err = await (handler as (event: unknown) => Promise<unknown>)(event).catch((e: unknown) => e) as InstanceType<typeof MockHTTPError>
    expect(err).toBeInstanceOf(MockHTTPError)
    expect(err.status).toBe(500)
  })
})
