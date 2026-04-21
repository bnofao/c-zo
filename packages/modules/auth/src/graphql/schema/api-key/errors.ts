import { BaseGraphQLError } from '@czo/kit/graphql'

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
  const ErrorInterface = builder.interfaceRef('Error')

  builder.objectType(ApiKeyExpiredError, {
    name: 'ApiKeyExpiredError',
    interfaces: [ErrorInterface],
    fields: (t: any) => ({
      keyId: t.exposeString('keyId'),
    }),
  })

  builder.objectType(ApiKeyRevokedError, {
    name: 'ApiKeyRevokedError',
    interfaces: [ErrorInterface],
    fields: (t: any) => ({
      keyId: t.exposeString('keyId'),
    }),
  })
}
