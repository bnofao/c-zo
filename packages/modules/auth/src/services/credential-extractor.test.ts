import { describe, expect, it } from 'vitest'
import { extractCredentials } from './credential-extractor'

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/graphql', {
    method: 'POST',
    headers,
  })
}

describe('extractCredentials', () => {
  describe('bearer token', () => {
    it('should extract Bearer token from authorization header', () => {
      const request = makeRequest({ authorization: 'Bearer my-token-123' })
      const result = extractCredentials(request, 'czo')

      expect(result).not.toBeNull()
      expect(result!.source).toBe('bearer')
      expect(result!.headers.get('authorization')).toBe('Bearer my-token-123')
    })

    it('should ignore non-Bearer authorization schemes', () => {
      const request = makeRequest({ authorization: 'Basic dXNlcjpwYXNz' })
      const result = extractCredentials(request, 'czo')

      expect(result).toBeNull()
    })

    it('should prioritize Bearer token over cookie', () => {
      const request = makeRequest({
        authorization: 'Bearer my-token',
        cookie: 'czo.session_token=abc123',
      })
      const result = extractCredentials(request, 'czo')

      expect(result).not.toBeNull()
      expect(result!.source).toBe('bearer')
    })
  })

  describe('cookie', () => {
    it('should extract session cookie when present', () => {
      const request = makeRequest({
        cookie: 'czo.session_token=abc123',
      })
      const result = extractCredentials(request, 'czo')

      expect(result).not.toBeNull()
      expect(result!.source).toBe('cookie')
      expect(result!.headers.get('cookie')).toBe('czo.session_token=abc123')
    })

    it('should extract session cookie among multiple cookies', () => {
      const request = makeRequest({
        cookie: 'other=value; czo.session_token=abc123; another=data',
      })
      const result = extractCredentials(request, 'czo')

      expect(result).not.toBeNull()
      expect(result!.source).toBe('cookie')
      expect(result!.headers.get('cookie')).toContain('czo.session_token=abc123')
    })

    it('should not match cookies with different prefix', () => {
      const request = makeRequest({
        cookie: 'other.session_token=abc123',
      })
      const result = extractCredentials(request, 'czo')

      expect(result).toBeNull()
    })

    it('should use custom cookie prefix', () => {
      const request = makeRequest({
        cookie: 'myapp.session_token=abc123',
      })
      const result = extractCredentials(request, 'myapp')

      expect(result).not.toBeNull()
      expect(result!.source).toBe('cookie')
    })
  })

  describe('api key', () => {
    it('should detect czo_ prefix in Bearer token as api-key source', () => {
      const request = makeRequest({ authorization: 'Bearer czo_abc123xyz' })
      const result = extractCredentials(request, 'czo')

      expect(result).not.toBeNull()
      expect(result!.source).toBe('api-key')
      expect(result!.headers.get('authorization')).toBe('Bearer czo_abc123xyz')
    })

    it('should detect regular Bearer token as bearer source', () => {
      const request = makeRequest({ authorization: 'Bearer regular-session-token' })
      const result = extractCredentials(request, 'czo')

      expect(result).not.toBeNull()
      expect(result!.source).toBe('bearer')
    })

    it('should return null for x-api-key header (handled by better-auth plugin)', () => {
      const request = makeRequest({
        'x-api-key': 'key-123',
      })
      const result = extractCredentials(request, 'czo')

      expect(result).toBeNull()
    })
  })

  describe('no credentials', () => {
    it('should return null when no credentials are present', () => {
      const request = makeRequest()
      const result = extractCredentials(request, 'czo')

      expect(result).toBeNull()
    })

    it('should return null for empty authorization header', () => {
      const request = makeRequest({ authorization: '' })
      const result = extractCredentials(request, 'czo')

      expect(result).toBeNull()
    })

    it('should return null for cookie without session token', () => {
      const request = makeRequest({
        cookie: 'other=value; tracking=abc',
      })
      const result = extractCredentials(request, 'czo')

      expect(result).toBeNull()
    })
  })
})
