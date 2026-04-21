import { BaseGraphQLError } from '@czo/kit/graphql'

// ─── Domain errors ────────────────────────────────────────────────────────────

export class TotpVerificationFailedError extends BaseGraphQLError {
  readonly code = 'TOTP_VERIFICATION_FAILED'
  constructor() {
    super('TOTP code verification failed')
    this.name = 'TotpVerificationFailedError'
  }
}

export class BackupCodeInvalidError extends BaseGraphQLError {
  readonly code = 'BACKUP_CODE_INVALID'
  constructor() {
    super('The backup code is invalid or has already been used')
    this.name = 'BackupCodeInvalidError'
  }
}

export class TwoFactorNotEnabledError extends BaseGraphQLError {
  readonly code = 'TWO_FACTOR_NOT_ENABLED'
  constructor() {
    super('Two-factor authentication is not enabled for this account')
    this.name = 'TwoFactorNotEnabledError'
  }
}

// ─── Registration ─────────────────────────────────────────────────────────────

export function registerTwoFactorErrors(builder: any): void {
  const ErrorInterface = builder.interfaceRef('Error')

  builder.objectType(TotpVerificationFailedError, {
    name: 'TotpVerificationFailedError',
    interfaces: [ErrorInterface],
    fields: (_t: any) => ({}),
  })

  builder.objectType(BackupCodeInvalidError, {
    name: 'BackupCodeInvalidError',
    interfaces: [ErrorInterface],
    fields: (_t: any) => ({}),
  })

  builder.objectType(TwoFactorNotEnabledError, {
    name: 'TwoFactorNotEnabledError',
    interfaces: [ErrorInterface],
    fields: (_t: any) => ({}),
  })
}
