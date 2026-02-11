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

vi.mock('../../../database/schema', () => ({
  session: { id: 'session_id_col' },
}))

vi.mock('drizzle-orm', () => ({
  eq: (col: unknown, val: unknown) => ({ col, val }),
}))

// eslint-disable-next-line import/first
import handler from './refresh.post'

describe('token refresh endpoint', () => {
  const mockGetSession = vi.fn()
  const mockGetToken = vi.fn()
  const mockRevokeSessions = vi.fn()

  const mockRotation = {
    hashToken: vi.fn((token: string) => `hash-${token}`),
    wasAlreadyRotated: vi.fn().mockResolvedValue(false),
    generateToken: vi.fn().mockReturnValue('new-refresh-token'),
    recordRotation: vi.fn().mockResolvedValue(undefined),
  }

  const mockDbUpdate = vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  })

  const createEvent = (overrides?: {
    auth?: unknown
    rotation?: unknown
    db?: unknown
  }) => ({
    context: {
      auth: overrides?.auth !== undefined
        ? overrides.auth
        : {
            api: {
              getSession: mockGetSession,
              getToken: mockGetToken,
              revokeSessions: mockRevokeSessions,
            },
          },
      rotation: overrides?.rotation !== undefined ? overrides.rotation : undefined,
      db: overrides?.db !== undefined ? overrides.db : undefined,
    },
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockRotation.wasAlreadyRotated.mockResolvedValue(false)
    mockRotation.generateToken.mockReturnValue('new-refresh-token')
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

  it('should return access token and original refresh token without rotation', async () => {
    mockReadBody.mockResolvedValue({ refreshToken: 'valid-token' })
    mockGetSession.mockResolvedValue({ session: { id: 's1' }, user: { id: 'u1' } })
    mockGetToken.mockResolvedValue({ token: 'new-jwt-token' })
    const event = createEvent()

    const result = await (handler as (event: unknown) => Promise<unknown>)(event)

    expect(result).toEqual({
      accessToken: 'new-jwt-token',
      refreshToken: 'valid-token',
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
    const event = createEvent({ auth: null })

    const err = await (handler as (event: unknown) => Promise<unknown>)(event).catch((e: unknown) => e) as InstanceType<typeof MockHTTPError>
    expect(err).toBeInstanceOf(MockHTTPError)
    expect(err.status).toBe(500)
  })

  describe('with token rotation', () => {
    it('should rotate the refresh token when rotation service and db are available', async () => {
      mockReadBody.mockResolvedValue({ refreshToken: 'old-token' })
      mockGetSession.mockResolvedValue({ session: { id: 's1' }, user: { id: 'u1' } })
      mockGetToken.mockResolvedValue({ token: 'new-jwt' })

      const event = createEvent({
        rotation: mockRotation,
        db: { update: mockDbUpdate },
      })

      const result = await (handler as (event: unknown) => Promise<unknown>)(event) as Record<string, unknown>

      expect(result.refreshToken).toBe('new-refresh-token')
      expect(result.accessToken).toBe('new-jwt')
    })

    it('should update session token in database during rotation', async () => {
      mockReadBody.mockResolvedValue({ refreshToken: 'old-token' })
      mockGetSession.mockResolvedValue({ session: { id: 's1' }, user: { id: 'u1' } })
      mockGetToken.mockResolvedValue({ token: 'jwt' })

      const mockSet = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) })
      const mockUpdate = vi.fn().mockReturnValue({ set: mockSet })

      const event = createEvent({
        rotation: mockRotation,
        db: { update: mockUpdate },
      })

      await (handler as (event: unknown) => Promise<unknown>)(event)

      expect(mockUpdate).toHaveBeenCalled()
      expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({
        token: 'new-refresh-token',
      }))
    })

    it('should record old token hash after rotation', async () => {
      mockReadBody.mockResolvedValue({ refreshToken: 'old-token' })
      mockGetSession.mockResolvedValue({ session: { id: 's1' }, user: { id: 'u1' } })
      mockGetToken.mockResolvedValue({ token: 'jwt' })

      const event = createEvent({
        rotation: mockRotation,
        db: { update: mockDbUpdate },
      })

      await (handler as (event: unknown) => Promise<unknown>)(event)

      expect(mockRotation.recordRotation).toHaveBeenCalledWith('s1', 'hash-old-token')
    })

    it('should detect token reuse and return 401', async () => {
      mockReadBody.mockResolvedValue({ refreshToken: 'stolen-token' })
      mockGetSession.mockResolvedValue({ session: { id: 's1' }, user: { id: 'u1' } })
      mockRotation.wasAlreadyRotated.mockResolvedValue(true)

      const event = createEvent({
        rotation: mockRotation,
        db: { update: mockDbUpdate },
      })

      const err = await (handler as (event: unknown) => Promise<unknown>)(event).catch((e: unknown) => e) as InstanceType<typeof MockHTTPError>
      expect(err).toBeInstanceOf(MockHTTPError)
      expect(err.status).toBe(401)
      expect(err.statusText).toContain('Token reuse detected')
    })

    it('should revoke all sessions on reuse detection', async () => {
      mockReadBody.mockResolvedValue({ refreshToken: 'stolen-token' })
      mockGetSession.mockResolvedValue({ session: { id: 's1' }, user: { id: 'u1' } })
      mockRotation.wasAlreadyRotated.mockResolvedValue(true)

      const event = createEvent({
        rotation: mockRotation,
        db: { update: mockDbUpdate },
      })

      await (handler as (event: unknown) => Promise<unknown>)(event).catch(() => {})

      expect(mockRevokeSessions).toHaveBeenCalledWith({
        headers: expect.any(Headers),
      })
    })
  })
})
