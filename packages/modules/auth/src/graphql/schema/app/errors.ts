import { BaseGraphQLError } from '@czo/kit/graphql'

// ─── Domain errors ────────────────────────────────────────────────────────────

export class AppHandleTakenError extends BaseGraphQLError {
  readonly code = 'APP_HANDLE_TAKEN'
  constructor(public readonly appId: string) {
    super(`App handle '${appId}' is already taken`)
    this.name = 'AppHandleTakenError'
  }
}

export class AppManifestInvalidError extends BaseGraphQLError {
  readonly code = 'APP_MANIFEST_INVALID'
  constructor(public readonly reason: string) {
    super(`App manifest is invalid: ${reason}`)
    this.name = 'AppManifestInvalidError'
  }
}

export class AppNotInstalledError extends BaseGraphQLError {
  readonly code = 'APP_NOT_INSTALLED'
  constructor(public readonly appId: string) {
    super(`App '${appId}' is not installed`)
    this.name = 'AppNotInstalledError'
  }
}

// ─── Registration ─────────────────────────────────────────────────────────────

export function registerAppErrors(builder: any): void {
  const ErrorInterface = builder.interfaceRef('Error')

  builder.objectType(AppHandleTakenError, {
    name: 'AppHandleTakenError',
    interfaces: [ErrorInterface],
    fields: (t: any) => ({
      appId: t.exposeString('appId'),
    }),
  })

  builder.objectType(AppManifestInvalidError, {
    name: 'AppManifestInvalidError',
    interfaces: [ErrorInterface],
    fields: (t: any) => ({
      reason: t.exposeString('reason'),
    }),
  })

  builder.objectType(AppNotInstalledError, {
    name: 'AppNotInstalledError',
    interfaces: [ErrorInterface],
    fields: (t: any) => ({
      appId: t.exposeString('appId'),
    }),
  })
}
