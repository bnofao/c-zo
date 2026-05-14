import { DrizzleDb } from '@czo/kit/db/effect'
import { expectFailure, expectSuccess } from '@czo/kit/effect'
import { Effect, Layer } from 'effect'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CannotPromoteToOwner,
  CannotRemoveLastOwner,
  InvitationNotFound,
  MemberAlreadyExists,
  MemberLimitReached,
  MemberNotFound,
  NotAMember,
  OrganizationLimitReached,
  OrganizationNotFound,
  OrganizationService,
  OrganizationSlugTaken,
  OrgInvalidRole,
  OrgUserNotFound,
} from '../services/organization'
import { makeAccessServiceLive } from './access'
import { OrganizationEventsLive } from './events/organization'
import { makeOrganizationServiceLive } from './organization'

// ─── Mocks ───────────────────────────────────────────────────────────

interface OrgRow { id: number, slug: string, name: string }
interface MemberRow { id: number, organizationId: number, userId: number, role: string }
interface UserRow { id: number, email: string }
interface InvRow { id: number, organizationId: number, email: string, status: string }

function makeMockDb(state: {
  org?: OrgRow | null
  user?: UserRow | null
  member?: MemberRow | null
  invitation?: InvRow | null
  ownerCount?: number
} = {}) {
  const orgFindFirst = vi.fn().mockResolvedValue(state.org ?? undefined)
  const orgFindMany = vi.fn().mockResolvedValue(state.org ? [state.org] : [])
  const userFindFirst = vi.fn().mockResolvedValue(state.user ?? undefined)
  const memberFindFirst = vi.fn().mockResolvedValue(state.member ?? undefined)
  const memberFindMany = vi.fn().mockResolvedValue(state.member ? [state.member] : [])
  const invFindFirst = vi.fn().mockResolvedValue(state.invitation ?? undefined)
  const invFindMany = vi.fn().mockResolvedValue(state.invitation ? [state.invitation] : [])

  const updateReturning = vi.fn().mockResolvedValue([state.org ?? state.member ?? state.invitation])
  const updateWhere = vi.fn(() => ({ returning: updateReturning }))
  const updateSet = vi.fn(() => ({ where: updateWhere }))
  const update = vi.fn(() => ({ set: updateSet }))

  const insertReturning = vi.fn().mockResolvedValue([state.member ?? state.org])
  const insertValues = vi.fn(() => ({ returning: insertReturning }))
  const insert = vi.fn(() => ({ values: insertValues }))

  const deleteReturning = vi.fn().mockResolvedValue([state.org ?? state.member])
  const deleteWhere = vi.fn(() => ({ returning: deleteReturning }))
  const del = vi.fn(() => ({ where: deleteWhere }))

  const $count = vi.fn().mockResolvedValue(state.ownerCount ?? 2)
  const transaction = vi.fn(async (fn: any) => fn({ insert }))

  const select = vi.fn(() => ({
    from: vi.fn(() => ({
      innerJoin: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([{ count: 0 }]),
        })),
      })),
    })),
  }))

  const db = {
    query: {
      organizations: { findFirst: orgFindFirst, findMany: orgFindMany },
      users: { findFirst: userFindFirst },
      members: { findFirst: memberFindFirst, findMany: memberFindMany },
      invitations: { findFirst: invFindFirst, findMany: invFindMany },
    },
    update,
    insert,
    delete: del,
    $count,
    transaction,
    select,
  }
  return { db, spies: { orgFindFirst, userFindFirst, memberFindFirst, invFindFirst, $count, insertReturning, updateReturning, deleteReturning } }
}

const DEFAULT_ROLE_NAMES = ['owner', 'admin', 'member'] as const

function makeAccessLayer(roleNames: readonly string[] = DEFAULT_ROLE_NAMES) {
  return makeAccessServiceLive(
    [{
      name: 'test',
      statements: {},
      hierarchy: roleNames.map(name => ({ name, permissions: {} })),
    }] as any,
    true,
  )
}

function makeTestLayer(db: object, roleNames?: readonly string[]) {
  const dbLayer = Layer.succeed(DrizzleDb, db as never)
  return makeOrganizationServiceLive().pipe(
    Layer.provide(Layer.mergeAll(dbLayer, makeAccessLayer(roleNames), OrganizationEventsLive)),
  )
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('organizationServiceLive — reads', () => {
  beforeEach(() => vi.clearAllMocks())

  it('checkSlug returns true when no org with slug', async () => {
    const { db } = makeMockDb({ org: null })
    const program = Effect.gen(function* () {
      const svc = yield* OrganizationService
      return yield* svc.checkSlug('free-slug')
    })
    expect(await expectSuccess(program.pipe(Effect.provide(makeTestLayer(db))))).toBe(true)
  })

  it('checkSlug returns false when slug taken', async () => {
    const { db } = makeMockDb({ org: { id: 1, slug: 'taken', name: 'X' } })
    const program = Effect.gen(function* () {
      const svc = yield* OrganizationService
      return yield* svc.checkSlug('taken')
    })
    expect(await expectSuccess(program.pipe(Effect.provide(makeTestLayer(db))))).toBe(false)
  })

  it('findFirst → OrganizationNotFound when no row', async () => {
    const { db } = makeMockDb({ org: null })
    const program = Effect.gen(function* () {
      const svc = yield* OrganizationService
      return yield* svc.findFirst({ where: { id: 99 } })
    })
    await expectFailure(program.pipe(Effect.provide(makeTestLayer(db))), OrganizationNotFound)
  })

  it('checkMembership → false when not member', async () => {
    const { db } = makeMockDb({ member: null })
    const program = Effect.gen(function* () {
      const svc = yield* OrganizationService
      return yield* svc.checkMembership(1, 2)
    })
    expect(await expectSuccess(program.pipe(Effect.provide(makeTestLayer(db))))).toBe(false)
  })
})

describe('organizationServiceLive — create', () => {
  beforeEach(() => vi.clearAllMocks())

  it('user not found → OrgUserNotFound', async () => {
    const { db } = makeMockDb({ user: null })
    const program = Effect.gen(function* () {
      const svc = yield* OrganizationService
      return yield* svc.create({ name: 'Acme', slug: 'acme', userId: 99 } as any)
    })
    await expectFailure(program.pipe(Effect.provide(makeTestLayer(db))), OrgUserNotFound)
  })

  it('slug taken → OrganizationSlugTaken', async () => {
    const { db, spies } = makeMockDb({ user: { id: 1, email: 'a@b.test' } })
    spies.orgFindFirst.mockResolvedValueOnce({ id: 7, slug: 'acme', name: 'Existing' })
    const program = Effect.gen(function* () {
      const svc = yield* OrganizationService
      return yield* svc.create({ name: 'Acme', slug: 'acme', userId: 1 } as any)
    })
    await expectFailure(program.pipe(Effect.provide(makeTestLayer(db))), OrganizationSlugTaken)
  })

  it('limit reached (function form) → OrganizationLimitReached', async () => {
    const { db } = makeMockDb({ user: { id: 1, email: 'a@b.test' } })
    const program = Effect.gen(function* () {
      const svc = yield* OrganizationService
      return yield* svc.create({ name: 'A', slug: 's', userId: 1 } as any, { limit: async () => true })
    })
    await expectFailure(program.pipe(Effect.provide(makeTestLayer(db))), OrganizationLimitReached)
  })
})

describe('organizationServiceLive — update / remove', () => {
  beforeEach(() => vi.clearAllMocks())

  it('update non-existing → OrganizationNotFound', async () => {
    const { db } = makeMockDb({ org: null })
    const program = Effect.gen(function* () {
      const svc = yield* OrganizationService
      return yield* svc.update(1, { name: 'x' } as any)
    })
    await expectFailure(program.pipe(Effect.provide(makeTestLayer(db))), OrganizationNotFound)
  })

  it('update with non-member actor → NotAMember', async () => {
    const { db } = makeMockDb({ org: { id: 1, slug: 's', name: 'A' }, member: null })
    const program = Effect.gen(function* () {
      const svc = yield* OrganizationService
      return yield* svc.update(1, { name: 'B' } as any, 99)
    })
    await expectFailure(program.pipe(Effect.provide(makeTestLayer(db))), NotAMember)
  })

  it('remove non-existing → OrganizationNotFound', async () => {
    const { db } = makeMockDb({ org: null })
    const program = Effect.gen(function* () {
      const svc = yield* OrganizationService
      return yield* svc.remove(1)
    })
    await expectFailure(program.pipe(Effect.provide(makeTestLayer(db))), OrganizationNotFound)
  })
})

describe('organizationServiceLive — addMember', () => {
  beforeEach(() => vi.clearAllMocks())

  it('user not found → OrgUserNotFound', async () => {
    const { db } = makeMockDb({ user: null })
    const program = Effect.gen(function* () {
      const svc = yield* OrganizationService
      return yield* svc.addMember({ organizationId: 1, userId: 99, role: 'member' } as any)
    })
    await expectFailure(program.pipe(Effect.provide(makeTestLayer(db))), OrgUserNotFound)
  })

  it('already member → MemberAlreadyExists', async () => {
    const { db } = makeMockDb({
      user: { id: 1, email: 'a@b.test' },
      member: { id: 5, organizationId: 1, userId: 1, role: 'member' },
    })
    const program = Effect.gen(function* () {
      const svc = yield* OrganizationService
      return yield* svc.addMember({ organizationId: 1, userId: 1, role: 'member' } as any)
    })
    await expectFailure(program.pipe(Effect.provide(makeTestLayer(db))), MemberAlreadyExists)
  })

  it('org not found → OrganizationNotFound', async () => {
    const { db, spies } = makeMockDb({
      user: { id: 1, email: 'a@b.test' },
      member: null,
    })
    spies.orgFindFirst.mockResolvedValueOnce(undefined)
    const program = Effect.gen(function* () {
      const svc = yield* OrganizationService
      return yield* svc.addMember({ organizationId: 99, userId: 1, role: 'member' } as any)
    })
    await expectFailure(program.pipe(Effect.provide(makeTestLayer(db))), OrganizationNotFound)
  })

  it('member limit reached → MemberLimitReached', async () => {
    const { db, spies } = makeMockDb({
      user: { id: 1, email: 'a@b.test' },
      member: null,
      org: { id: 1, slug: 's', name: 'A' },
    })
    spies.$count.mockResolvedValueOnce(50)
    const program = Effect.gen(function* () {
      const svc = yield* OrganizationService
      return yield* svc.addMember({ organizationId: 1, userId: 1, role: 'member' } as any, 50)
    })
    await expectFailure(program.pipe(Effect.provide(makeTestLayer(db))), MemberLimitReached)
  })

  it('invalid role → OrgInvalidRole', async () => {
    const { db } = makeMockDb({
      user: { id: 1, email: 'a@b.test' },
      member: null,
      org: { id: 1, slug: 's', name: 'A' },
    })
    const program = Effect.gen(function* () {
      const svc = yield* OrganizationService
      return yield* svc.addMember({ organizationId: 1, userId: 1, role: 'ghost' } as any)
    })
    await expectFailure(
      program.pipe(Effect.provide(makeTestLayer(db, ['owner', 'member']))),
      OrgInvalidRole,
    )
  })
})

describe('organizationServiceLive — removeMember / updateMemberRole', () => {
  beforeEach(() => vi.clearAllMocks())

  it('removeMember not found → MemberNotFound', async () => {
    const { db } = makeMockDb({ member: null })
    const program = Effect.gen(function* () {
      const svc = yield* OrganizationService
      return yield* svc.removeMember({ identifier: 99, organizationId: 1 } as any)
    })
    await expectFailure(program.pipe(Effect.provide(makeTestLayer(db))), MemberNotFound)
  })

  it('removeMember last owner → CannotRemoveLastOwner', async () => {
    const { db, spies } = makeMockDb({
      member: { id: 5, organizationId: 1, userId: 1, role: 'owner' },
      ownerCount: 1,
    })
    spies.$count.mockResolvedValueOnce(1)
    const program = Effect.gen(function* () {
      const svc = yield* OrganizationService
      return yield* svc.removeMember({ identifier: 1, organizationId: 1 } as any)
    })
    await expectFailure(program.pipe(Effect.provide(makeTestLayer(db))), CannotRemoveLastOwner)
  })

  it('updateMemberRole promote-to-owner from non-owner → CannotPromoteToOwner', async () => {
    const { db } = makeMockDb({
      member: { id: 5, organizationId: 1, userId: 2, role: 'member' },
    })
    const program = Effect.gen(function* () {
      const svc = yield* OrganizationService
      return yield* svc.updateMemberRole(
        { id: 5, organizationId: 1, role: 'owner' } as any,
      )
    })
    await expectFailure(program.pipe(Effect.provide(makeTestLayer(db))), CannotPromoteToOwner)
  })

  it('updateMemberRole not-found → MemberNotFound', async () => {
    const { db } = makeMockDb({ member: null })
    const program = Effect.gen(function* () {
      const svc = yield* OrganizationService
      return yield* svc.updateMemberRole({ id: 99, organizationId: 1, role: 'member' } as any)
    })
    await expectFailure(program.pipe(Effect.provide(makeTestLayer(db))), MemberNotFound)
  })
})

describe('organizationServiceLive — invitations', () => {
  beforeEach(() => vi.clearAllMocks())

  it('getInvitation not found → InvitationNotFound', async () => {
    const { db } = makeMockDb({ invitation: null })
    const program = Effect.gen(function* () {
      const svc = yield* OrganizationService
      return yield* svc.getInvitation(99)
    })
    await expectFailure(program.pipe(Effect.provide(makeTestLayer(db))), InvitationNotFound)
  })

  it('cancelInvitation not found → InvitationNotFound', async () => {
    const { db } = makeMockDb({ invitation: null })
    const program = Effect.gen(function* () {
      const svc = yield* OrganizationService
      return yield* svc.cancelInvitation(99)
    })
    await expectFailure(program.pipe(Effect.provide(makeTestLayer(db))), InvitationNotFound)
  })

  it('cancelInvitation by non-member actor → NotAMember', async () => {
    const { db } = makeMockDb({
      invitation: { id: 5, organizationId: 1, email: 'a@b.test', status: 'pending' },
      member: null,
    })
    const program = Effect.gen(function* () {
      const svc = yield* OrganizationService
      return yield* svc.cancelInvitation(5, 99)
    })
    await expectFailure(program.pipe(Effect.provide(makeTestLayer(db))), NotAMember)
  })
})
