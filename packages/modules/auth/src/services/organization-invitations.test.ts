import { DrizzleDb } from '@czo/kit/db/effect'
import { expect, layer } from '@effect/vitest'
import { eq } from 'drizzle-orm'
import { Effect, Layer } from 'effect'
import { invitations, members, organizations, users } from '../database/schema'
import { ORGANIZATION_HIERARCHY, ORGANIZATION_STATEMENTS } from '../plugins/access'
import { AuthPostgresLayer, truncateAuth } from '../testing/postgres'
import * as Access from './access'
import { BetterAuth } from './auth-instance'
import * as OrganizationEvents from './events/organization'
import * as Organization from './organization'

const { OrganizationService } = Organization

// Stub BetterAuth — the invitations test suite doesn't exercise hasPermission,
// so an empty plugin list is enough to satisfy the dep.
const BetterAuthStub = Layer.succeed(BetterAuth, { options: { plugins: [] } } as never)

// OrganizationService over Testcontainers Postgres, with AccessService seeded
// with the organization domain so role validation (`org:*` roles) passes.
const TestLayer = Organization.layer.pipe(
  Layer.provide(Layer.mergeAll(
    Access.makeLayer(
      [{ name: 'organization', statements: ORGANIZATION_STATEMENTS, hierarchy: ORGANIZATION_HIERARCHY }] as never,
      true,
    ),
    OrganizationEvents.layer,
    BetterAuthStub,
  )),
  Layer.provideMerge(AuthPostgresLayer),
)

// ─── Seed helper ─────────────────────────────────────────────────────────
// Inserts a user, an organization, and that user as an `org:owner` member.
// Returns their ids. Run inside an Effect that has DrizzleDb.
function seedOrgWithOwner(email: string, slug: string) {
  return Effect.gen(function* () {
    const db = yield* DrizzleDb
    const now = new Date()
    const userRows = yield* db.insert(users).values({
      name: 'Owner',
      email,
      role: 'user',
      createdAt: now,
      updatedAt: now,
    } as never).returning()
    const orgRows = yield* db.insert(organizations).values({
      name: 'Acme',
      slug,
      createdAt: now,
    } as never).returning()
    // `.values(... as never)` erases Drizzle's inferred return type, so the row id is cast back here.
    const user = userRows[0] as { id: number }
    const org = orgRows[0] as { id: number }
    yield* db.insert(members).values({
      organizationId: org.id,
      userId: user.id,
      role: 'org:owner',
      createdAt: now,
    } as never)
    return { userId: user.id, orgId: org.id }
  })
}

layer(TestLayer)('OrganizationService.createInvitation', (it) => {
  it.effect('creates a pending invitation for a member-inviter', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const { userId, orgId } = yield* seedOrgWithOwner('owner1@x.com', 'acme1')
      const svc = yield* OrganizationService
      const inv = yield* svc.createInvitation({
        organizationId: orgId,
        email: 'invitee@x.com',
        role: 'org:admin',
        inviterId: userId,
      })
      expect(inv.status).toBe('pending')
      expect(inv.email).toBe('invitee@x.com')
      expect(inv.organizationId).toBe(orgId)
      expect(inv.expiresAt.getTime()).toBeGreaterThan(Date.now())
    }))

  it.effect('rejects an invalid role with OrgInvalidRole', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const { userId, orgId } = yield* seedOrgWithOwner('owner3@x.com', 'acme3')
      const svc = yield* OrganizationService
      const err = yield* svc.createInvitation({
        organizationId: orgId,
        email: 'x@x.com',
        role: 'not-a-role',
        inviterId: userId,
      }).pipe(Effect.flip)
      expect(err._tag).toBe('OrgInvalidRole')
    }))

  it.effect('rejects a duplicate pending invitation with InvitationAlreadyExists', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const { userId, orgId } = yield* seedOrgWithOwner('owner4@x.com', 'acme4')
      const svc = yield* OrganizationService
      yield* svc.createInvitation({ organizationId: orgId, email: 'dup@x.com', role: 'org:admin', inviterId: userId })
      const err = yield* svc.createInvitation({
        organizationId: orgId,
        email: 'dup@x.com',
        role: 'org:admin',
        inviterId: userId,
      }).pipe(Effect.flip)
      expect(err._tag).toBe('InvitationAlreadyExists')
    }))

  it.effect('rejects inviting an existing member with MemberAlreadyExists', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const { userId, orgId } = yield* seedOrgWithOwner('owner5@x.com', 'acme5')
      const svc = yield* OrganizationService
      const err = yield* svc.createInvitation({
        organizationId: orgId,
        email: 'owner5@x.com',
        role: 'org:admin',
        inviterId: userId,
      }).pipe(Effect.flip)
      expect(err._tag).toBe('MemberAlreadyExists')
    }))

  it.effect('resend reuses the pending invitation and refreshes its expiry', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const { userId, orgId } = yield* seedOrgWithOwner('owner6@x.com', 'acme6')
      const svc = yield* OrganizationService
      const first = yield* svc.createInvitation({
        organizationId: orgId,
        email: 're@x.com',
        role: 'org:admin',
        inviterId: userId,
      })
      const again = yield* svc.createInvitation({
        organizationId: orgId,
        email: 're@x.com',
        role: 'org:admin',
        inviterId: userId,
        resend: true,
      })
      expect(again.id).toBe(first.id)
      expect(again.status).toBe('pending')
      expect(again.expiresAt.getTime()).toBeGreaterThanOrEqual(first.expiresAt.getTime())
    }))

  it.effect('rejects a non-existent organization with OrganizationNotFound', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const svc = yield* OrganizationService
      const err = yield* svc.createInvitation({
        organizationId: 999999,
        email: 'x@x.com',
        role: 'org:admin',
        inviterId: 1,
      }).pipe(Effect.flip)
      expect(err._tag).toBe('OrganizationNotFound')
    }))
})

// ─── Seed helper for acceptInvitation tests ──────────────────────────────────
function seedInvitation(opts: {
  ownerEmail: string
  slug: string
  inviteeEmail: string
  role?: string
  status?: string
  expiresAt?: Date
}) {
  return Effect.gen(function* () {
    const db = yield* DrizzleDb
    const now = new Date()
    const { userId: ownerId, orgId } = yield* seedOrgWithOwner(opts.ownerEmail, opts.slug)
    const inviteeRows = yield* db.insert(users).values({
      name: 'Invitee',
      email: opts.inviteeEmail,
      role: 'user',
      createdAt: now,
      updatedAt: now,
    } as never).returning()
    const invRows = yield* db.insert(invitations).values({
      organizationId: orgId,
      email: opts.inviteeEmail,
      role: opts.role ?? 'org:admin',
      status: opts.status ?? 'pending',
      expiresAt: opts.expiresAt ?? new Date(Date.now() + 86_400_000),
      inviterId: ownerId,
      createdAt: now,
    } as never).returning()
    const invitee = inviteeRows[0] as { id: number }
    const inv = invRows[0] as { id: number }
    return { orgId, inviteeId: invitee.id, invitationId: inv.id }
  })
}

layer(TestLayer)('OrganizationService.acceptInvitation', (it) => {
  it.effect('creates the member and marks the invitation accepted', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const { orgId, inviteeId, invitationId } = yield* seedInvitation({
        ownerEmail: 'o1@x.com',
        slug: 'a1',
        inviteeEmail: 'i1@x.com',
      })
      const svc = yield* OrganizationService
      const { invitation, member } = yield* svc.acceptInvitation(invitationId, inviteeId)
      expect(member.organizationId).toBe(orgId)
      expect(member.userId).toBe(inviteeId)
      expect(invitation.id).toBe(invitationId)
      expect(invitation.status).toBe('accepted')
    }))

  it.effect('rejects an expired invitation with InvitationExpired', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const { inviteeId, invitationId } = yield* seedInvitation({
        ownerEmail: 'o2@x.com',
        slug: 'a2',
        inviteeEmail: 'i2@x.com',
        expiresAt: new Date(Date.now() - 1000),
      })
      const svc = yield* OrganizationService
      const err = yield* svc.acceptInvitation(invitationId, inviteeId).pipe(Effect.flip)
      expect(err._tag).toBe('InvitationExpired')
    }))

  it.effect('rejects a non-pending invitation with InvitationNotPending', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const { inviteeId, invitationId } = yield* seedInvitation({
        ownerEmail: 'o3@x.com',
        slug: 'a3',
        inviteeEmail: 'i3@x.com',
        status: 'cancelled',
      })
      const svc = yield* OrganizationService
      const err = yield* svc.acceptInvitation(invitationId, inviteeId).pipe(Effect.flip)
      expect(err._tag).toBe('InvitationNotPending')
    }))

  it.effect('rejects a mismatched accepting user with InvitationEmailMismatch', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const { invitationId } = yield* seedInvitation({
        ownerEmail: 'o4@x.com',
        slug: 'a4',
        inviteeEmail: 'i4@x.com',
      })
      // the owner (a different user/email) tries to accept i4's invitation
      const db = yield* DrizzleDb
      const ownerRows = yield* db.select().from(users).where(eq(users.email, 'o4@x.com'))
      const owner = ownerRows[0] as { id: number }
      const svc = yield* OrganizationService
      const err = yield* svc.acceptInvitation(invitationId, owner.id).pipe(Effect.flip)
      expect(err._tag).toBe('InvitationEmailMismatch')
    }))

  it.effect('rejects an unknown invitation id with InvitationNotFound', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const svc = yield* OrganizationService
      const err = yield* svc.acceptInvitation(999999, 1).pipe(Effect.flip)
      expect(err._tag).toBe('InvitationNotFound')
    }))

  it.effect('rejects when the invitee is already a member with MemberAlreadyExists', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const { orgId, inviteeId, invitationId } = yield* seedInvitation({
        ownerEmail: 'o6@x.com',
        slug: 'a6',
        inviteeEmail: 'i6@x.com',
      })
      const db = yield* DrizzleDb
      yield* db.insert(members).values({
        organizationId: orgId,
        userId: inviteeId,
        role: 'org:member',
        createdAt: new Date(),
      } as never)
      const svc = yield* OrganizationService
      const err = yield* svc.acceptInvitation(invitationId, inviteeId).pipe(Effect.flip)
      expect(err._tag).toBe('MemberAlreadyExists')
    }))

  it.effect('rejects a non-existent user with OrgUserNotFound', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const { invitationId } = yield* seedInvitation({
        ownerEmail: 'o7@x.com',
        slug: 'a7',
        inviteeEmail: 'i7@x.com',
      })
      const svc = yield* OrganizationService
      const err = yield* svc.acceptInvitation(invitationId, 999999).pipe(Effect.flip)
      expect(err._tag).toBe('OrgUserNotFound')
    }))
})

layer(TestLayer)('OrganizationService.rejectInvitation', (it) => {
  it.effect('marks a pending invitation rejected', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const { inviteeId, invitationId } = yield* seedInvitation({
        ownerEmail: 'or1@x.com',
        slug: 'rj1',
        inviteeEmail: 'ir1@x.com',
      })
      const svc = yield* OrganizationService
      const rejected = yield* svc.rejectInvitation(invitationId, inviteeId)
      expect(rejected.id).toBe(invitationId)
      expect(rejected.status).toBe('rejected')
    }))

  it.effect('rejects a mismatched user with InvitationEmailMismatch', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const { invitationId } = yield* seedInvitation({
        ownerEmail: 'or2@x.com',
        slug: 'rj2',
        inviteeEmail: 'ir2@x.com',
      })
      const db = yield* DrizzleDb
      const [owner] = yield* db.select().from(users).where(eq(users.email, 'or2@x.com'))
      const svc = yield* OrganizationService
      const err = yield* svc.rejectInvitation(invitationId, (owner as { id: number }).id).pipe(Effect.flip)
      expect(err._tag).toBe('InvitationEmailMismatch')
    }))

  it.effect('rejects a non-pending invitation with InvitationNotPending', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const { inviteeId, invitationId } = yield* seedInvitation({
        ownerEmail: 'or3@x.com',
        slug: 'rj3',
        inviteeEmail: 'ir3@x.com',
        status: 'accepted',
      })
      const svc = yield* OrganizationService
      const err = yield* svc.rejectInvitation(invitationId, inviteeId).pipe(Effect.flip)
      expect(err._tag).toBe('InvitationNotPending')
    }))

  it.effect('rejects an unknown invitation id with InvitationNotFound', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const svc = yield* OrganizationService
      const err = yield* svc.rejectInvitation(999999, 1).pipe(Effect.flip)
      expect(err._tag).toBe('InvitationNotFound')
    }))

  it.effect('rejects a non-existent user with OrgUserNotFound', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const { invitationId } = yield* seedInvitation({
        ownerEmail: 'or4@x.com',
        slug: 'rj4',
        inviteeEmail: 'ir4@x.com',
      })
      const svc = yield* OrganizationService
      const err = yield* svc.rejectInvitation(invitationId, 999999).pipe(Effect.flip)
      expect(err._tag).toBe('OrgUserNotFound')
    }))
})
