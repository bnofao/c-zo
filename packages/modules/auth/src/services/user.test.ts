import { DrizzleDb } from '@czo/kit/db/effect'
import { expectFailure, expectSuccess } from '@czo/kit/effect'
import { Effect, Layer } from 'effect'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BetterAuth } from './auth-instance'
import {
  CannotBanSelf,
  CannotDemoteSelf,
  CannotRemoveSelf,
  CredentialLinkFailed,
  InvalidRole,
  UserAlreadyBanned,
  UserAlreadyExists,
  UserNoChanges,
  UserNotBanned,
  UserNotFound,
  UserService,
} from './user'
import * as Access from './access'
import * as UserEvents from './events/user'
import * as User from './user'

// ─── Mocks ───────────────────────────────────────────────────────────

interface UserRow {
  id: number
  email: string
  name: string
  role: string | null
  banned: boolean | null
  banReason: string | null
  banExpires: Date | null
  createdAt: Date
  updatedAt: Date
}

function baseRow(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: 1,
    email: 'a@b.test',
    name: 'Alice',
    role: 'user',
    banned: false,
    banReason: null,
    banExpires: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  }
}

function makeMockDb(initialRow: UserRow | null) {
  const findFirst = vi.fn().mockResolvedValue(initialRow ?? undefined)
  const findMany = vi.fn().mockResolvedValue(initialRow ? [initialRow] : [])
  const updateReturning = vi.fn().mockResolvedValue(initialRow ? [{ ...initialRow }] : [])
  const updateWhere = vi.fn(() => ({ returning: updateReturning }))
  const updateSet = vi.fn(() => ({ where: updateWhere }))
  const update = vi.fn(() => ({ set: updateSet }))
  const insertReturning = vi.fn().mockResolvedValue(initialRow ? [{ ...initialRow }] : [])
  const insertValues = vi.fn(() => ({ returning: insertReturning }))
  const insert = vi.fn(() => ({ values: insertValues }))

  const db = {
    query: { users: { findFirst, findMany } },
    update,
    insert,
    delete: vi.fn(),
  }
  return { db, spies: { findFirst, findMany, update, updateSet, updateReturning, insert, insertValues, insertReturning } }
}

function makeAuthStub(overrides: {
  hash?: (p: string) => Promise<string>
  linkAccount?: (...args: any[]) => Promise<unknown>
  updatePassword?: (...args: any[]) => Promise<unknown>
  deleteUser?: (...args: any[]) => Promise<unknown>
} = {}) {
  return {
    options: {},
    $context: Promise.resolve({
      options: {},
      password: {
        hash: overrides.hash ?? (async (p: string) => `hashed:${p}`),
      },
      internalAdapter: {
        linkAccount: overrides.linkAccount ?? (async () => ({})),
        updatePassword: overrides.updatePassword ?? (async () => ({})),
        deleteUser: overrides.deleteUser ?? (async () => ({})),
      },
    }),
  } as never
}

// Default access seed for tests: a single provider with `admin` / `user` roles.
// Tests that exercise InvalidRole pass a different seed (e.g. only `admin`).
const DEFAULT_ROLE_NAMES = ['admin', 'user'] as const

function makeAccessLayer(roleNames: readonly string[] = DEFAULT_ROLE_NAMES) {
  return Access.makeLayer(
    [{
      name: 'test',
      statements: {},
      hierarchy: roleNames.map(name => ({ name, permissions: {} })),
    }] as any,
    true,
  )
}

function makeTestLayer(db: object, auth: unknown = makeAuthStub(), roleNames?: readonly string[]) {
  const dbLayer = Layer.succeed(DrizzleDb, db as never)
  const authLayer = Layer.succeed(BetterAuth, auth as never)
  return User.layer.pipe(
    Layer.provide(Layer.mergeAll(dbLayer, authLayer, makeAccessLayer(roleNames), UserEvents.layer)),
  )
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('userServiceLive — findFirst / findMany', () => {
  beforeEach(() => vi.clearAllMocks())

  it('findFirst → UserNotFound when no row', async () => {
    const { db } = makeMockDb(null)
    const program = Effect.gen(function* () {
      const svc = yield* UserService
      return yield* svc.findFirst({ where: { id: 99 } })
    })
    await expectFailure(program.pipe(Effect.provide(makeTestLayer(db))), UserNotFound)
  })

  it('findFirst → returns row', async () => {
    const row = baseRow()
    const { db } = makeMockDb(row)
    const program = Effect.gen(function* () {
      const svc = yield* UserService
      return yield* svc.findFirst({ where: { id: 1 } })
    })
    const result = await expectSuccess(program.pipe(Effect.provide(makeTestLayer(db))))
    expect(result.id).toBe(1)
  })
})

describe('userServiceLive — create', () => {
  beforeEach(() => vi.clearAllMocks())

  it('email already in use → UserAlreadyExists', async () => {
    const existing = baseRow()
    const { db } = makeMockDb(existing)
    const program = Effect.gen(function* () {
      const svc = yield* UserService
      return yield* svc.create({ email: existing.email, name: 'x' } as any)
    })
    await expectFailure(program.pipe(Effect.provide(makeTestLayer(db))), UserAlreadyExists)
  })

  it('role not in registry → InvalidRole', async () => {
    const { db, spies } = makeMockDb(null)
    spies.findFirst.mockResolvedValueOnce(undefined) // email lookup
    const program = Effect.gen(function* () {
      const svc = yield* UserService
      return yield* svc.create({ email: 'new@x.test', name: 'n', role: 'ghost' } as any)
    })
    await expectFailure(
      program.pipe(Effect.provide(makeTestLayer(db, makeAuthStub(), ['admin', 'user']))),
      InvalidRole,
    )
  })

  it('credential link fails → CredentialLinkFailed', async () => {
    const newRow = baseRow({ id: 2, email: 'new@x.test' })
    const { db, spies } = makeMockDb(newRow)
    spies.findFirst.mockResolvedValueOnce(undefined)
    spies.insertReturning.mockResolvedValueOnce([newRow])
    const auth = makeAuthStub({
      linkAccount: async () => { throw new Error('boom') },
    })
    const program = Effect.gen(function* () {
      const svc = yield* UserService
      return yield* svc.create({ email: 'new@x.test', name: 'n', password: 'pw' } as any)
    })
    await expectFailure(program.pipe(Effect.provide(makeTestLayer(db, auth))), CredentialLinkFailed)
  })

  it('happy path → returns user', async () => {
    const newRow = baseRow({ id: 3, email: 'ok@x.test' })
    const { db, spies } = makeMockDb(newRow)
    spies.findFirst.mockResolvedValueOnce(undefined)
    spies.insertReturning.mockResolvedValueOnce([newRow])
    const program = Effect.gen(function* () {
      const svc = yield* UserService
      return yield* svc.create({ email: 'ok@x.test', name: 'OK' } as any)
    })
    const result = await expectSuccess(program.pipe(Effect.provide(makeTestLayer(db))))
    expect(result.id).toBe(3)
  })
})

describe('userServiceLive — update', () => {
  beforeEach(() => vi.clearAllMocks())

  it('user not found → UserNotFound', async () => {
    const { db } = makeMockDb(null)
    const program = Effect.gen(function* () {
      const svc = yield* UserService
      return yield* svc.update(1, { name: 'x' } as any)
    })
    await expectFailure(program.pipe(Effect.provide(makeTestLayer(db))), UserNotFound)
  })

  it('empty input → UserNoChanges', async () => {
    const { db } = makeMockDb(baseRow())
    const program = Effect.gen(function* () {
      const svc = yield* UserService
      return yield* svc.update(1, {} as any)
    })
    await expectFailure(program.pipe(Effect.provide(makeTestLayer(db))), UserNoChanges)
  })
})

describe('userServiceLive — ban / unban', () => {
  beforeEach(() => vi.clearAllMocks())

  it('ban self (actorId === id) → CannotBanSelf', async () => {
    const { db } = makeMockDb(baseRow({ id: 7 }))
    const program = Effect.gen(function* () {
      const svc = yield* UserService
      return yield* svc.ban(7, { reason: 'x' } as any, 7)
    })
    await expectFailure(program.pipe(Effect.provide(makeTestLayer(db))), CannotBanSelf)
  })

  it('already banned → UserAlreadyBanned', async () => {
    const { db } = makeMockDb(baseRow({ id: 8, banned: true }))
    const program = Effect.gen(function* () {
      const svc = yield* UserService
      return yield* svc.ban(8, { reason: 'x' } as any)
    })
    await expectFailure(program.pipe(Effect.provide(makeTestLayer(db))), UserAlreadyBanned)
  })

  it('unban not banned → UserNotBanned', async () => {
    const { db } = makeMockDb(baseRow({ banned: false }))
    const program = Effect.gen(function* () {
      const svc = yield* UserService
      return yield* svc.unban(1)
    })
    await expectFailure(program.pipe(Effect.provide(makeTestLayer(db))), UserNotBanned)
  })

  it('ban → updates row', async () => {
    const row = baseRow({ id: 9 })
    const { db, spies } = makeMockDb(row)
    spies.updateReturning.mockResolvedValueOnce([{ ...row, banned: true, banReason: 'spam' }])
    const program = Effect.gen(function* () {
      const svc = yield* UserService
      return yield* svc.ban(9, { reason: 'spam' } as any)
    })
    const result = await expectSuccess(program.pipe(Effect.provide(makeTestLayer(db))))
    expect(result.banned).toBe(true)
  })
})

describe('userServiceLive — setRole', () => {
  beforeEach(() => vi.clearAllMocks())

  it('invalid role → InvalidRole', async () => {
    const { db } = makeMockDb(baseRow())
    const program = Effect.gen(function* () {
      const svc = yield* UserService
      return yield* svc.setRole(1, 'ghost')
    })
    await expectFailure(
      program.pipe(Effect.provide(makeTestLayer(db, makeAuthStub(), ['admin', 'user']))),
      InvalidRole,
    )
  })

  it('actorId === id → CannotDemoteSelf', async () => {
    const { db } = makeMockDb(baseRow({ id: 5 }))
    const program = Effect.gen(function* () {
      const svc = yield* UserService
      return yield* svc.setRole(5, 'user', 5)
    })
    await expectFailure(program.pipe(Effect.provide(makeTestLayer(db))), CannotDemoteSelf)
  })
})

describe('userServiceLive — remove', () => {
  beforeEach(() => vi.clearAllMocks())

  it('actorId === id → CannotRemoveSelf', async () => {
    const { db } = makeMockDb(baseRow({ id: 12 }))
    const program = Effect.gen(function* () {
      const svc = yield* UserService
      return yield* svc.remove(12, 12)
    })
    await expectFailure(program.pipe(Effect.provide(makeTestLayer(db))), CannotRemoveSelf)
  })

  it('happy path → true', async () => {
    const { db } = makeMockDb(baseRow({ id: 13 }))
    const program = Effect.gen(function* () {
      const svc = yield* UserService
      return yield* svc.remove(13, 99)
    })
    const result = await expectSuccess(program.pipe(Effect.provide(makeTestLayer(db))))
    expect(result).toBe(true)
  })
})

// ─── hasPermission ───────────────────────────────────────────────────

// Access seed for hasPermission tests: admin role inherits user-role perms
// (self-read only) and adds full user-management actions, mirroring the
// real ADMIN_HIERARCHY shape but with simple `user` / `admin` role names.
function makeHasPermissionAccessLayer() {
  return Access.makeLayer(
    [{
      name: 'test',
      statements: { user: ['create', 'read', 'update', 'ban', 'set-role'] },
      hierarchy: [
        { name: 'user', permissions: { user: ['read'] } },
        { name: 'admin', permissions: { user: ['create', 'update', 'ban', 'set-role'] } },
      ],
    }] as any,
    true,
  )
}

function makeHasPermissionLayer(db: object) {
  const dbLayer = Layer.succeed(DrizzleDb, db as never)
  const authLayer = Layer.succeed(BetterAuth, makeAuthStub())
  return User.layer.pipe(
    Layer.provide(Layer.mergeAll(dbLayer, authLayer, makeHasPermissionAccessLayer(), UserEvents.layer)),
  )
}

describe('userServiceLive — hasPermission', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns true when role grants the required permission (AND)', async () => {
    const { db } = makeMockDb(null)
    const program = Effect.gen(function* () {
      const svc = yield* UserService
      return yield* svc.hasPermission({ role: 'admin', permissions: { user: ['create'] } })
    })
    const ok = await expectSuccess(program.pipe(Effect.provide(makeHasPermissionLayer(db))))
    expect(ok).toBe(true)
  })

  it('returns false when role lacks the required permission', async () => {
    const { db } = makeMockDb(null)
    const program = Effect.gen(function* () {
      const svc = yield* UserService
      return yield* svc.hasPermission({ role: 'user', permissions: { user: ['ban'] } })
    })
    const ok = await expectSuccess(program.pipe(Effect.provide(makeHasPermissionLayer(db))))
    expect(ok).toBe(false)
  })

  it('returns false when role is unknown', async () => {
    const { db } = makeMockDb(null)
    const program = Effect.gen(function* () {
      const svc = yield* UserService
      return yield* svc.hasPermission({ role: 'martian', permissions: { user: ['create'] } })
    })
    const ok = await expectSuccess(program.pipe(Effect.provide(makeHasPermissionLayer(db))))
    expect(ok).toBe(false)
  })

  it('multi-role string ("admin,user") returns true if any role authorizes', async () => {
    const { db } = makeMockDb(null)
    const program = Effect.gen(function* () {
      const svc = yield* UserService
      return yield* svc.hasPermission({ role: 'admin,user', permissions: { user: ['ban'] } })
    })
    const ok = await expectSuccess(program.pipe(Effect.provide(makeHasPermissionLayer(db))))
    expect(ok).toBe(true)
  })

  it('defaults to "user" role when role param is undefined', async () => {
    const { db } = makeMockDb(null)
    const program = Effect.gen(function* () {
      const svc = yield* UserService
      return yield* svc.hasPermission({ permissions: { user: ['ban'] } })
    })
    const ok = await expectSuccess(program.pipe(Effect.provide(makeHasPermissionLayer(db))))
    expect(ok).toBe(false)
  })
})
