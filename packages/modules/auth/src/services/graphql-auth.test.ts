import { GraphQLError } from 'graphql'
import { describe, expect, it, vi } from 'vitest'
import { validateGraphQLAuth } from './graphql-auth'

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/graphql', {
    method: 'POST',
    headers,
  })
}

function makeMockAuth(sessionResponse: unknown = null) {
  return {
    api: {
      getSession: vi.fn().mockResolvedValue(sessionResponse),
      getToken: vi.fn(),
      revokeSessions: vi.fn(),
    },
    handler: vi.fn(),
  } as any
}

const validSessionResponse = {
  session: {
    id: 'session-1',
    userId: 'user-1',
    expiresAt: new Date('2030-01-01'),
    actorType: 'customer',
    authMethod: 'email',
    organizationId: null,
  },
  user: {
    id: 'user-1',
    email: 'test@example.com',
    name: 'Test User',
  },
}

describe('validateGraphQLAuth', () => {
  describe('successful authentication', () => {
    it('should authenticate with Bearer token', async () => {
      const auth = makeMockAuth(validSessionResponse)
      const request = makeRequest({ authorization: 'Bearer my-token' })

      const result = await validateGraphQLAuth({ auth, request })

      expect(result.authSource).toBe('bearer')
      expect(result.user.id).toBe('user-1')
      expect(result.user.email).toBe('test@example.com')
      expect(result.session.id).toBe('session-1')
      expect(auth.api.getSession).toHaveBeenCalledWith({
        headers: expect.any(Headers),
      })
    })

    it('should authenticate with session cookie', async () => {
      const auth = makeMockAuth(validSessionResponse)
      const request = makeRequest({ cookie: 'czo.session_token=abc123' })

      const result = await validateGraphQLAuth({ auth, request })

      expect(result.authSource).toBe('cookie')
      expect(result.user.id).toBe('user-1')
    })

    it('should use custom cookie prefix', async () => {
      const auth = makeMockAuth(validSessionResponse)
      const request = makeRequest({ cookie: 'myapp.session_token=abc123' })

      const result = await validateGraphQLAuth({
        auth,
        request,
        cookiePrefix: 'myapp',
      })

      expect(result.authSource).toBe('cookie')
    })

    it('should populate actorType from session', async () => {
      const sessionWithAdmin = {
        ...validSessionResponse,
        session: { ...validSessionResponse.session, actorType: 'admin' },
      }
      const auth = makeMockAuth(sessionWithAdmin)
      const request = makeRequest({ authorization: 'Bearer token' })

      const result = await validateGraphQLAuth({ auth, request })

      expect(result.actorType).toBe('admin')
      expect(result.session.actorType).toBe('admin')
    })

    it('should populate organization from session', async () => {
      const sessionWithOrg = {
        ...validSessionResponse,
        session: { ...validSessionResponse.session, organizationId: 'org-42' },
      }
      const auth = makeMockAuth(sessionWithOrg)
      const request = makeRequest({ authorization: 'Bearer token' })

      const result = await validateGraphQLAuth({ auth, request })

      expect(result.organization).toBe('org-42')
      expect(result.session.organizationId).toBe('org-42')
    })

    it('should default actorType to customer when missing', async () => {
      const sessionNoActor = {
        ...validSessionResponse,
        session: { ...validSessionResponse.session, actorType: undefined },
      }
      const auth = makeMockAuth(sessionNoActor)
      const request = makeRequest({ authorization: 'Bearer token' })

      const result = await validateGraphQLAuth({ auth, request })

      expect(result.actorType).toBe('customer')
      expect(result.session.actorType).toBe('customer')
    })

    it('should convert string expiresAt to Date', async () => {
      const sessionStringDate = {
        ...validSessionResponse,
        session: { ...validSessionResponse.session, expiresAt: '2030-01-01T00:00:00.000Z' },
      }
      const auth = makeMockAuth(sessionStringDate)
      const request = makeRequest({ authorization: 'Bearer token' })

      const result = await validateGraphQLAuth({ auth, request })

      expect(result.session.expiresAt).toBeInstanceOf(Date)
    })
  })

  describe('authentication failure', () => {
    it('should throw UNAUTHENTICATED when no credentials are present', async () => {
      const auth = makeMockAuth()
      const request = makeRequest()

      await expect(validateGraphQLAuth({ auth, request }))
        .rejects
        .toThrow(GraphQLError)

      try {
        await validateGraphQLAuth({ auth, request })
      }
      catch (error) {
        expect((error as GraphQLError).message).toBe('Unauthenticated')
        expect((error as GraphQLError).extensions.code).toBe('UNAUTHENTICATED')
        expect((error as GraphQLError).extensions.http).toEqual({ status: 401 })
      }
    })

    it('should throw UNAUTHENTICATED when session is invalid', async () => {
      const auth = makeMockAuth(null)
      const request = makeRequest({ authorization: 'Bearer expired-token' })

      await expect(validateGraphQLAuth({ auth, request }))
        .rejects
        .toThrow(GraphQLError)

      expect(auth.api.getSession).toHaveBeenCalled()
    })

    it('should not call getSession when no credentials found', async () => {
      const auth = makeMockAuth()
      const request = makeRequest()

      try {
        await validateGraphQLAuth({ auth, request })
      }
      catch {
        // expected
      }

      expect(auth.api.getSession).not.toHaveBeenCalled()
    })

    it('should throw UNAUTHENTICATED for API key (not yet implemented)', async () => {
      const auth = makeMockAuth()
      const request = makeRequest({ 'x-api-key': 'key-123' })

      await expect(validateGraphQLAuth({ auth, request }))
        .rejects
        .toThrow(GraphQLError)
    })

    it('should throw UNAUTHENTICATED when getSession throws an error', async () => {
      const auth = makeMockAuth()
      auth.api.getSession.mockRejectedValue(new Error('DB connection lost'))
      const request = makeRequest({ authorization: 'Bearer valid-token' })

      await expect(validateGraphQLAuth({ auth, request }))
        .rejects
        .toThrow(GraphQLError)

      try {
        await validateGraphQLAuth({ auth, request })
      }
      catch (error) {
        expect((error as GraphQLError).message).toBe('Unauthenticated')
        expect((error as GraphQLError).extensions.code).toBe('UNAUTHENTICATED')
      }
    })
  })
})
