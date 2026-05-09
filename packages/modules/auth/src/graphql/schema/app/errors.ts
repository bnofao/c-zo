import { BaseGraphQLError, registerError } from '@czo/kit/graphql'

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
  registerError(builder, AppHandleTakenError, {
    name: 'AppHandleTakenError',
    fields: t => ({ appId: t.exposeString('appId') }),
  })

  registerError(builder, AppManifestInvalidError, {
    name: 'AppManifestInvalidError',
    fields: t => ({ reason: t.exposeString('reason') }),
  })

  registerError(builder, AppNotInstalledError, {
    name: 'AppNotInstalledError',
    fields: t => ({ appId: t.exposeString('appId') }),
  })
}
