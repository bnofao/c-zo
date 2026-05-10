import type {
  AuthRelations,
  CreateOrganizationInput,
  CreateOrgMemberInput,
  Organization,
  OrganizationInvitation,
  OrganizationMember,
  RemoveOrgMemberInput,
  UpdateOrganizationInput,
  UpdateOrgMemberInput,
} from '@czo/auth/types'
import type { Database } from '@czo/kit/db'
import type { Effect } from 'effect'
import { Context, Data } from 'effect'

// ─── Tagged errors (also serve as Pothos GraphQL errors via registerError) ───

export class OrganizationNotFound extends Data.TaggedError('OrganizationNotFound') {
  readonly code = 'ORGANIZATION_NOT_FOUND'
  get message() { return 'Organization not found' }
}

export class OrganizationSlugTaken extends Data.TaggedError('OrganizationSlugTaken')<{
  readonly slug: string
}> {
  readonly code = 'ORGANIZATION_SLUG_TAKEN'
  get message() { return `Organization slug '${this.slug}' is already taken` }
}

export class OrganizationLimitReached extends Data.TaggedError('OrganizationLimitReached') {
  readonly code = 'ORGANIZATION_LIMIT_REACHED'
  get message() { return 'You have reached the maximum number of organizations' }
}

export class OrgUserNotFound extends Data.TaggedError('OrgUserNotFound') {
  readonly code = 'ORG_USER_NOT_FOUND'
  get message() { return 'User not found' }
}

export class NotAMember extends Data.TaggedError('NotAMember') {
  readonly code = 'NOT_A_MEMBER'
  get message() { return 'You are not a member of this organization' }
}

export class MemberNotFound extends Data.TaggedError('MemberNotFound') {
  readonly code = 'MEMBER_NOT_FOUND'
  get message() { return 'Member not found in this organization' }
}

export class MemberAlreadyExists extends Data.TaggedError('MemberAlreadyExists')<{
  readonly member: OrganizationMember
}> {
  readonly code = 'MEMBER_ALREADY_EXISTS'
  get message() { return 'User is already a member of this organization' }
}

export class MemberLimitReached extends Data.TaggedError('MemberLimitReached') {
  readonly code = 'MEMBER_LIMIT_REACHED'
  get message() { return 'This organization has reached its member limit' }
}

export class CannotRemoveLastOwner extends Data.TaggedError('CannotRemoveLastOwner') {
  readonly code = 'CANNOT_REMOVE_LAST_OWNER'
  get message() { return 'Cannot remove the last owner of an organization' }
}

export class CannotPromoteToOwner extends Data.TaggedError('CannotPromoteToOwner') {
  readonly code = 'CANNOT_PROMOTE_TO_OWNER'
  get message() { return 'Only existing owners can grant the owner role' }
}

export class CannotLeaveAsLastOwner extends Data.TaggedError('CannotLeaveAsLastOwner') {
  readonly code = 'CANNOT_LEAVE_AS_LAST_OWNER'
  get message() { return 'You are the last owner — transfer ownership before leaving' }
}

export class OrgInvalidRole extends Data.TaggedError('OrgInvalidRole')<{
  readonly role: string
}> {
  readonly code = 'ORG_INVALID_ROLE'
  get message() { return `Invalid organization role: '${this.role}'` }
}

export class InvitationNotFound extends Data.TaggedError('InvitationNotFound') {
  readonly code = 'INVITATION_NOT_FOUND'
  get message() { return 'Invitation not found' }
}

export class InvitationExpired extends Data.TaggedError('InvitationExpired') {
  readonly code = 'INVITATION_EXPIRED'
  get message() { return 'Invitation has expired' }
}

export class InvitationAlreadyExists extends Data.TaggedError('InvitationAlreadyExists') {
  readonly code = 'INVITATION_ALREADY_EXISTS'
  get message() { return 'A pending invitation already exists for this email' }
}

export class InvitationLimitReached extends Data.TaggedError('InvitationLimitReached') {
  readonly code = 'INVITATION_LIMIT_REACHED'
  get message() { return 'Invitation limit reached for this organization' }
}

export class OrgNoChanges extends Data.TaggedError('OrgNoChanges') {
  readonly code = 'ORG_NO_CHANGES'
  get message() { return 'No changes provided' }
}

export class OrgDbFailed extends Data.TaggedError('OrgDbFailed')<{
  readonly cause: unknown
}> {
  readonly code = 'ORG_DB_FAILED'
  get message() { return 'Database operation failed' }
}

export type OrganizationError
  = | OrganizationNotFound
    | OrganizationSlugTaken
    | OrganizationLimitReached
    | OrgUserNotFound
    | NotAMember
    | MemberNotFound
    | MemberAlreadyExists
    | MemberLimitReached
    | CannotRemoveLastOwner
    | CannotPromoteToOwner
    | CannotLeaveAsLastOwner
    | OrgInvalidRole
    | InvitationNotFound
    | InvitationExpired
    | InvitationAlreadyExists
    | InvitationLimitReached
    | OrgNoChanges
    | OrgDbFailed

// ─── Service contract (Effect Tag) ───────────────────────────────────

type OrgFindFirstConfig = Parameters<Database<AuthRelations>['query']['organizations']['findFirst']>[0]
type OrgFindManyConfig = Parameters<Database<AuthRelations>['query']['organizations']['findMany']>[0]
type MemberFindManyConfig = Parameters<Database<AuthRelations>['query']['members']['findMany']>[0]
type InvitationFindManyConfig = Parameters<Database<AuthRelations>['query']['invitations']['findMany']>[0]

export interface CreateOrgScope {
  /**
   * Optional organization-count limit per user. `function` form: caller
   *  decides reach by inspecting the creating user.
   */
  limit?: number | ((userId: number) => Promise<boolean>)
  /** Role to grant the creating user. Defaults to 'owner'. */
  role?: string | string[]
}

export interface MemberScope {
  /**
   * Role of the actor performing the change (used to enforce e.g. "only
   *  owners can promote to owner"). Defaults to 'owner'.
   */
  creatorRole?: string
}

export class OrganizationService extends Context.Tag('@czo/auth/OrganizationService')<
  OrganizationService,
  {
    // ── Reads ────────────────────────────────────────────────────────
    readonly checkMembership: (
      organizationId: number,
      userId: number,
    ) => Effect.Effect<boolean, OrgDbFailed>

    readonly checkSlug: (
      slug: string,
    ) => Effect.Effect<boolean, OrgDbFailed>

    readonly findFirst: (
      config?: OrgFindFirstConfig,
      authUserId?: number,
    ) => Effect.Effect<Organization, OrganizationNotFound | OrgDbFailed>

    readonly findMany: (
      config?: OrgFindManyConfig,
      authUserId?: number,
    ) => Effect.Effect<readonly Organization[], OrgDbFailed>

    // ── Writes ───────────────────────────────────────────────────────
    readonly create: (
      input: CreateOrganizationInput,
      scope?: CreateOrgScope,
    ) => Effect.Effect<
      Organization & { members: readonly OrganizationMember[] },
      OrgUserNotFound | OrganizationSlugTaken | OrganizationLimitReached | OrgDbFailed
    >

    readonly update: (
      id: number,
      input: UpdateOrganizationInput,
      actorId?: number,
    ) => Effect.Effect<
      Organization,
      OrganizationNotFound | OrganizationSlugTaken | NotAMember | OrgNoChanges | OrgDbFailed
    >

    readonly remove: (
      id: number,
      actorId?: number,
    ) => Effect.Effect<Organization, OrganizationNotFound | NotAMember | OrgDbFailed>

    // ── Members ──────────────────────────────────────────────────────
    readonly listMembers: (
      organizationId: number,
      config?: MemberFindManyConfig,
    ) => Effect.Effect<readonly OrganizationMember[], OrgDbFailed>

    readonly addMember: (
      input: CreateOrgMemberInput,
      memberLimit?: number,
    ) => Effect.Effect<
      OrganizationMember,
      OrgUserNotFound | OrganizationNotFound | MemberAlreadyExists | MemberLimitReached
      | OrgInvalidRole | OrgDbFailed
    >

    readonly removeMember: (
      input: RemoveOrgMemberInput,
      scope?: MemberScope,
    ) => Effect.Effect<
      OrganizationMember,
      MemberNotFound | CannotRemoveLastOwner | OrgDbFailed
    >

    readonly updateMemberRole: (
      input: UpdateOrgMemberInput,
      scope?: MemberScope,
    ) => Effect.Effect<
      OrganizationMember,
      MemberNotFound | OrgInvalidRole | CannotPromoteToOwner
      | CannotLeaveAsLastOwner | NotAMember | OrgDbFailed
    >

    // ── Invitations ──────────────────────────────────────────────────
    readonly getInvitation: (
      id: number,
    ) => Effect.Effect<OrganizationInvitation, InvitationNotFound | OrgDbFailed>

    readonly listInvitations: (
      organizationId: number,
      config?: InvitationFindManyConfig,
    ) => Effect.Effect<readonly OrganizationInvitation[], OrgDbFailed>

    readonly listUserInvitations: (
      email: string,
    ) => Effect.Effect<readonly OrganizationInvitation[], OrgDbFailed>

    readonly cancelInvitation: (
      id: number,
      actorId?: number,
    ) => Effect.Effect<OrganizationInvitation, InvitationNotFound | NotAMember | OrgDbFailed>
  }
>() {}
