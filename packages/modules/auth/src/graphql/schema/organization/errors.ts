import { registerError } from '@czo/kit/graphql'
import { Organization } from '../../../services'

const {
  CannotLeaveAsLastOwner,
  CannotPromoteToOwner,
  CannotRemoveLastOwner,
  InvitationAlreadyExists,
  InvitationEmailMismatch,
  InvitationExpired,
  InvitationLimitReached,
  InvitationNotFound,
  InvitationNotPending,
  MemberAlreadyExists,
  MemberLimitReached,
  MemberNotFound,
  NotAMember,
  OrganizationLimitReached,
  OrganizationNotFound,
  OrganizationSlugTaken,
  OrgInvalidRole,
  OrgNoChanges,
  OrgUserNotFound,
} = Organization

// Re-export the tagged-error classes so resolvers can list them in
// `errors: { types: [...] }` without reaching into services/.
export {
  CannotLeaveAsLastOwner,
  CannotPromoteToOwner,
  CannotRemoveLastOwner,
  InvitationAlreadyExists,
  InvitationEmailMismatch,
  InvitationExpired,
  InvitationLimitReached,
  InvitationNotFound,
  InvitationNotPending,
  MemberAlreadyExists,
  MemberLimitReached,
  MemberNotFound,
  NotAMember,
  OrganizationLimitReached,
  OrganizationNotFound,
  OrganizationSlugTaken,
  OrgInvalidRole,
  OrgNoChanges,
  OrgUserNotFound,
}

export function registerOrganizationErrors(builder: any): void {
  registerError(builder, OrganizationNotFound, { name: 'OrganizationNotFoundError', subGraphs: ['org'] })
  registerError(builder, OrganizationSlugTaken, {
    name: 'OrganizationSlugTakenError',
    subGraphs: ['org'],
    fields: t => ({ slug: t.exposeString('slug') }),
  })
  registerError(builder, OrganizationLimitReached, { name: 'OrganizationLimitReachedError', subGraphs: ['org'] })
  registerError(builder, OrgUserNotFound, { name: 'OrganizationUserNotFoundError', subGraphs: ['account', 'org'] })
  registerError(builder, NotAMember, { name: 'NotAMemberError', subGraphs: ['account', 'org'] })
  registerError(builder, MemberNotFound, { name: 'MemberNotFoundError', subGraphs: ['account', 'org'] })
  registerError(builder, MemberAlreadyExists, { name: 'MemberAlreadyExistsError', subGraphs: ['account', 'org'] })
  registerError(builder, MemberLimitReached, { name: 'MemberLimitReachedError', subGraphs: ['org'] })
  registerError(builder, CannotRemoveLastOwner, { name: 'CannotRemoveLastOwnerError', subGraphs: ['account', 'org'] })
  registerError(builder, CannotPromoteToOwner, { name: 'CannotPromoteToOwnerError', subGraphs: ['org'] })
  registerError(builder, CannotLeaveAsLastOwner, { name: 'CannotLeaveAsLastOwnerError', subGraphs: ['org'] })
  registerError(builder, OrgInvalidRole, {
    name: 'OrganizationInvalidRoleError',
    subGraphs: ['org'],
    fields: t => ({ role: t.exposeString('role') }),
  })
  registerError(builder, InvitationNotFound, { name: 'InvitationNotFoundError', subGraphs: ['account', 'org'] })
  registerError(builder, InvitationExpired, { name: 'InvitationExpiredError', subGraphs: ['account', 'org'] })
  registerError(builder, InvitationAlreadyExists, { name: 'InvitationAlreadyExistsError', subGraphs: ['org'] })
  registerError(builder, InvitationLimitReached, { name: 'InvitationLimitReachedError', subGraphs: ['org'] })
  registerError(builder, InvitationNotPending, { name: 'InvitationNotPendingError', subGraphs: ['account', 'org'] })
  registerError(builder, InvitationEmailMismatch, { name: 'InvitationEmailMismatchError', subGraphs: ['account', 'org'] })
  registerError(builder, OrgNoChanges, { name: 'OrganizationNoChangesError', subGraphs: ['org'] })
}
