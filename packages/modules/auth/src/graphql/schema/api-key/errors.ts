import { BaseGraphQLError, registerError } from '@czo/kit/graphql'

// ─── Domain errors ────────────────────────────────────────────────────────────

export class ApiKeyExpiredError extends BaseGraphQLError {
  readonly code = 'API_KEY_EXPIRED'
  constructor(public readonly keyId: string) {
    super(`API key '${keyId}' has expired`)
    this.name = 'ApiKeyExpiredError'
  }
}

export class ApiKeyRevokedError extends BaseGraphQLError {
  readonly code = 'API_KEY_REVOKED'
  constructor(public readonly keyId: string) {
    super(`API key '${keyId}' has been revoked`)
    this.name = 'ApiKeyRevokedError'
  }
}

// ─── Registration ─────────────────────────────────────────────────────────────

export function registerApiKeyErrors(builder: any): void {
  registerError(builder, ApiKeyExpiredError, {
    name: 'ApiKeyExpiredError',
    fields: t => ({ keyId: t.exposeString('keyId') }),
  })

  registerError(builder, ApiKeyRevokedError, {
    name: 'ApiKeyRevokedError',
    fields: t => ({ keyId: t.exposeString('keyId') }),
  })
}
