import { BaseGraphQLError } from '@czo/kit/graphql'

// ─── Domain errors ────────────────────────────────────────────────────────────

export class CannotLeaveAsLastOwnerError extends BaseGraphQLError {
  readonly code = 'CANNOT_LEAVE_AS_LAST_OWNER'
  constructor() {
    super('You cannot leave the organization as the last owner')
    this.name = 'CannotLeaveAsLastOwnerError'
  }
}

export class InvitationExpiredError extends BaseGraphQLError {
  readonly code = 'INVITATION_EXPIRED'
  constructor(public readonly invitationId: string) {
    super(`Invitation '${invitationId}' has expired`)
    this.name = 'InvitationExpiredError'
  }
}

export class MembershipAlreadyExistsError extends BaseGraphQLError {
  readonly code = 'MEMBERSHIP_ALREADY_EXISTS'
  constructor(public readonly userId: string, public readonly organizationId: string) {
    super(`User '${userId}' is already a member of organization '${organizationId}'`)
    this.name = 'MembershipAlreadyExistsError'
  }
}

export class SlugAlreadyTakenError extends BaseGraphQLError {
  readonly code = 'SLUG_ALREADY_TAKEN'
  constructor(public readonly slug: string) {
    super(`Organization slug '${slug}' is already taken`)
    this.name = 'SlugAlreadyTakenError'
  }
}

// ─── Registration ─────────────────────────────────────────────────────────────

export function registerOrganizationErrors(builder: any): void {
  const ErrorInterface = builder.interfaceRef('Error')

  builder.objectType(CannotLeaveAsLastOwnerError, {
    name: 'CannotLeaveAsLastOwnerError',
    interfaces: [ErrorInterface],
    fields: (_t: any) => ({}),
  })

  builder.objectType(InvitationExpiredError, {
    name: 'InvitationExpiredError',
    interfaces: [ErrorInterface],
    fields: (t: any) => ({
      invitationId: t.exposeString('invitationId'),
    }),
  })

  builder.objectType(MembershipAlreadyExistsError, {
    name: 'MembershipAlreadyExistsError',
    interfaces: [ErrorInterface],
    fields: (t: any) => ({
      userId: t.exposeString('userId'),
      organizationId: t.exposeString('organizationId'),
    }),
  })

  builder.objectType(SlugAlreadyTakenError, {
    name: 'SlugAlreadyTakenError',
    interfaces: [ErrorInterface],
    fields: (t: any) => ({
      slug: t.exposeString('slug'),
    }),
  })
}
