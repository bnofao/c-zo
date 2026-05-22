import { registerError } from '@czo/kit/graphql'
import { Organization } from '../../../services'

const {
  CannotLeaveAsLastOwner,
  CannotPromoteToOwner,
  CannotRemoveLastOwner,
  InvitationAlreadyExists,
  InvitationExpired,
  InvitationLimitReached,
  InvitationNotFound,
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
  InvitationExpired,
  InvitationLimitReached,
  InvitationNotFound,
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
  registerError(builder, OrganizationNotFound, { name: 'OrganizationNotFoundError' })
  registerError(builder, OrganizationSlugTaken, {
    name: 'OrganizationSlugTakenError',
    fields: t => ({ slug: t.exposeString('slug') }),
  })
  registerError(builder, OrganizationLimitReached, { name: 'OrganizationLimitReachedError' })
  registerError(builder, OrgUserNotFound, { name: 'OrganizationUserNotFoundError' })
  registerError(builder, NotAMember, { name: 'NotAMemberError' })
  registerError(builder, MemberNotFound, { name: 'MemberNotFoundError' })
  registerError(builder, MemberAlreadyExists, { name: 'MemberAlreadyExistsError' })
  registerError(builder, MemberLimitReached, { name: 'MemberLimitReachedError' })
  registerError(builder, CannotRemoveLastOwner, { name: 'CannotRemoveLastOwnerError' })
  registerError(builder, CannotPromoteToOwner, { name: 'CannotPromoteToOwnerError' })
  registerError(builder, CannotLeaveAsLastOwner, { name: 'CannotLeaveAsLastOwnerError' })
  registerError(builder, OrgInvalidRole, {
    name: 'OrganizationInvalidRoleError',
    fields: t => ({ role: t.exposeString('role') }),
  })
  registerError(builder, InvitationNotFound, { name: 'InvitationNotFoundError' })
  registerError(builder, InvitationExpired, { name: 'InvitationExpiredError' })
  registerError(builder, InvitationAlreadyExists, { name: 'InvitationAlreadyExistsError' })
  registerError(builder, InvitationLimitReached, { name: 'InvitationLimitReachedError' })
  registerError(builder, OrgNoChanges, { name: 'OrganizationNoChangesError' })
}
