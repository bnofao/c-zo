import { BaseGraphQLError, registerError } from '@czo/kit/graphql'

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

export class UserNotBannedError extends BaseGraphQLError {
  readonly code = 'USER_NOT_BANNED'
  constructor(public readonly userId: string) {
    super(`User '${userId}' is not banned`)
    this.name = 'UserNotBannedError'
  }
}

// ─── Registration ─────────────────────────────────────────────────────────────

export function registerUserErrors(builder: any): void {
  registerError(builder, CannotBanSelfError, { name: 'CannotBanSelfError' })
  registerError(builder, CannotDemoteSelfError, { name: 'CannotDemoteSelfError' })

  registerError(builder, UserAlreadyBannedError, {
    name: 'UserAlreadyBannedError',
    fields: t => ({ userId: t.exposeString('userId') }),
  })

  registerError(builder, UserNotBannedError, {
    name: 'UserNotBannedError',
    fields: t => ({ userId: t.exposeString('userId') }),
  })
}
