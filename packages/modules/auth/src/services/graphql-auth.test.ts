import { GraphQLError } from 'graphql'
import { describe, expect, it, vi } from 'vitest'
import { isIntrospectionQuery, validateGraphQLAuth } from './graphql-auth'

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

describe('isIntrospectionQuery', () => {
  describe('positive cases — should return true', () => {
    it('should detect __schema query', () => {
      expect(isIntrospectionQuery({
        query: '{ __schema { types { name } } }',
      })).toBe(true)
    })

    it('should detect __type query', () => {
      expect(isIntrospectionQuery({
        query: '{ __type(name: "User") { name fields { name } } }',
      })).toBe(true)
    })

    it('should detect __typename query', () => {
      expect(isIntrospectionQuery({
        query: '{ __typename }',
      })).toBe(true)
    })

    it('should detect operationName IntrospectionQuery', () => {
      expect(isIntrospectionQuery({
        query: 'query IntrospectionQuery { __schema { types { name } } }',
        operationName: 'IntrospectionQuery',
      })).toBe(true)
    })

    it('should detect combined __schema and __type', () => {
      expect(isIntrospectionQuery({
        query: '{ __schema { types { name } } __type(name: "User") { name } }',
      })).toBe(true)
    })

    it('should detect named introspection query without operationName', () => {
      expect(isIntrospectionQuery({
        query: 'query MyIntrospection { __schema { queryType { name } } }',
      })).toBe(true)
    })

    it('should detect __schema with fragments', () => {
      expect(isIntrospectionQuery({
        query: `
          query IntrospectionQuery {
            __schema {
              queryType { name }
              mutationType { name }
              types { ...FullType }
            }
          }
          fragment FullType on __Type {
            kind
            name
          }
        `,
        operationName: 'IntrospectionQuery',
      })).toBe(true)
    })

    it('should handle query with extra whitespace and newlines', () => {
      expect(isIntrospectionQuery({
        query: `
          {
            __schema
              {
                types { name }
              }
          }
        `,
      })).toBe(true)
    })
  })

  describe('negative cases — should return false', () => {
    it('should reject null body', () => {
      expect(isIntrospectionQuery(null)).toBe(false)
    })

    it('should reject body without query', () => {
      expect(isIntrospectionQuery({})).toBe(false)
    })

    it('should reject empty query string', () => {
      expect(isIntrospectionQuery({ query: '' })).toBe(false)
    })

    it('should reject regular query', () => {
      expect(isIntrospectionQuery({
        query: '{ products { id name } }',
      })).toBe(false)
    })

    it('should reject mutation', () => {
      expect(isIntrospectionQuery({
        query: 'mutation { createProduct(input: { name: "Test" }) { id } }',
      })).toBe(false)
    })

    it('should reject regular operationName that is not IntrospectionQuery', () => {
      expect(isIntrospectionQuery({
        query: 'query GetProducts { products { id } }',
        operationName: 'GetProducts',
      })).toBe(false)
    })

    it('should reject invalid GraphQL syntax', () => {
      expect(isIntrospectionQuery({
        query: 'this is not valid graphql {{{{',
      })).toBe(false)
    })

    it('should reject subscription', () => {
      expect(isIntrospectionQuery({
        query: 'subscription { orderUpdated { id status } }',
      })).toBe(false)
    })
  })

  describe('mixed queries — security critical', () => {
    it('should reject introspection mixed with data fields', () => {
      expect(isIntrospectionQuery({
        query: '{ __schema { types { name } } products { id } }',
      })).toBe(false)
    })

    it('should reject __typename mixed with data fields', () => {
      expect(isIntrospectionQuery({
        query: '{ __typename products { id name } }',
      })).toBe(false)
    })

    it('should reject __type mixed with data fields', () => {
      expect(isIntrospectionQuery({
        query: '{ __type(name: "Product") { name } products { id } }',
      })).toBe(false)
    })
  })

  describe('edge cases', () => {
    it('should reject __schema appearing only inside a string argument', () => {
      expect(isIntrospectionQuery({
        query: '{ search(query: "__schema { types { name } }") { id } }',
      })).toBe(false)
    })

    it('should reject query with only whitespace', () => {
      expect(isIntrospectionQuery({ query: '   \n\t  ' })).toBe(false)
    })

    it('should handle body with query set to non-string', () => {
      expect(isIntrospectionQuery({ query: 123 as any })).toBe(false)
    })

    it('should reject introspection with fragment spread containing data fields', () => {
      expect(isIntrospectionQuery({
        query: `
          query { __schema { types { name } } ...DataFragment }
          fragment DataFragment on Query { products { id } }
        `,
      })).toBe(false)
    })

    it('should reject multi-operation document when non-introspection operation exists', () => {
      expect(isIntrospectionQuery({
        query: 'query Intro { __schema { types { name } } } query Data { products { id } }',
        operationName: 'Intro',
      })).toBe(false)
    })
  })
})
