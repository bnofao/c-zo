import { BaseGraphQLError } from '@czo/kit/graphql'

// ─── Domain errors ────────────────────────────────────────────────────────────

export class CannotBanSelfError extends BaseGraphQLError {
  readonly code = 'CANNOT_BAN_SELF'
  constructor() {
    super('You cannot ban yourself')
    this.name = 'CannotBanSelfError'
  }
}

export class CannotDemoteSelfError extends BaseGraphQLError {
  readonly code = 'CANNOT_DEMOTE_SELF'
  constructor() {
    super('You cannot demote yourself')
    this.name = 'CannotDemoteSelfError'
  }
}

export class UserAlreadyBannedError extends BaseGraphQLError {
  readonly code = 'USER_ALREADY_BANNED'
  constructor(public readonly userId: string) {
    super(`User '${userId}' is already banned`)
    this.name = 'UserAlreadyBannedError'
  }
}

// ─── Registration ─────────────────────────────────────────────────────────────

export function registerUserErrors(builder: any): void {
  const ErrorInterface = builder.interfaceRef('Error')

  builder.objectType(CannotBanSelfError, {
    name: 'CannotBanSelfError',
    interfaces: [ErrorInterface],
    fields: (_t: any) => ({}),
  })

  builder.objectType(CannotDemoteSelfError, {
    name: 'CannotDemoteSelfError',
    interfaces: [ErrorInterface],
    fields: (_t: any) => ({}),
  })

  builder.objectType(UserAlreadyBannedError, {
    name: 'UserAlreadyBannedError',
    interfaces: [ErrorInterface],
    fields: (t: any) => ({
      userId: t.exposeString('userId'),
    }),
  })
}
