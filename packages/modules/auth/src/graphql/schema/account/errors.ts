import { BaseGraphQLError } from '@czo/kit/graphql'

// ─── Domain errors ────────────────────────────────────────────────────────────

export class PasswordMismatchError extends BaseGraphQLError {
  readonly code = 'PASSWORD_MISMATCH'
  constructor() {
    super('The current password is incorrect')
    this.name = 'PasswordMismatchError'
  }
}

export class AccountAlreadyLinkedError extends BaseGraphQLError {
  readonly code = 'ACCOUNT_ALREADY_LINKED'
  constructor(public readonly providerId: string) {
    super(`Account for provider '${providerId}' is already linked`)
    this.name = 'AccountAlreadyLinkedError'
  }
}

export class CannotUnlinkLastAccountError extends BaseGraphQLError {
  readonly code = 'CANNOT_UNLINK_LAST_ACCOUNT'
  constructor() {
    super('Cannot unlink the last linked account')
    this.name = 'CannotUnlinkLastAccountError'
  }
}

// ─── Registration ─────────────────────────────────────────────────────────────

export function registerAccountErrors(builder: any): void {
  const ErrorInterface = builder.interfaceRef('Error')

  builder.objectType(PasswordMismatchError, {
    name: 'PasswordMismatchError',
    interfaces: [ErrorInterface],
    fields: (_t: any) => ({}),
  })

  builder.objectType(AccountAlreadyLinkedError, {
    name: 'AccountAlreadyLinkedError',
    interfaces: [ErrorInterface],
    fields: (t: any) => ({
      providerId: t.exposeString('providerId'),
    }),
  })

  builder.objectType(CannotUnlinkLastAccountError, {
    name: 'CannotUnlinkLastAccountError',
    interfaces: [ErrorInterface],
    fields: (_t: any) => ({}),
  })
}
