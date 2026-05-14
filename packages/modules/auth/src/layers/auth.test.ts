import { expectSuccess } from '@czo/kit/effect'
import { Effect, Layer } from 'effect'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthService } from '../services/auth'
import { BetterAuth } from '../services/auth-instance'
import { AuthServiceLive } from './auth'

// ─── Auth stub ───────────────────────────────────────────────────────

function authorizeStub(grants: Record<string, string[]>) {
  return {
    authorize: (req: Record<string, string[]>) => {
      // Subset check: every requested action must be in the granted set.
      const ok = Object.entries(req).every(([res, actions]) =>
        actions.every(a => grants[res]?.includes(a)),
      )
      return { success: ok }
    },
  }
}

function makeAuthStub(opts: {
  adminUserIds?: string[]
  adminRoles?: Record<string, { authorize: (...args: any[]) => { success: boolean } }>
  adminDefaultRole?: string
  orgRoles?: Record<string, { authorize: (...args: any[]) => { success: boolean } }>
  orgCreatorRole?: string
} = {}) {
  const plugins: Array<{ id: string, options: unknown }> = []
  if (opts.adminUserIds || opts.adminRoles || opts.adminDefaultRole) {
    plugins.push({
      id: 'admin',
      options: {
        adminUserIds: opts.adminUserIds ?? [],
        roles: opts.adminRoles ?? {},
        defaultRole: opts.adminDefaultRole,
      },
    })
  }
  if (opts.orgRoles || opts.orgCreatorRole) {
    plugins.push({
      id: 'organization',
      options: {
        roles: opts.orgRoles ?? {},
        creatorRole: opts.orgCreatorRole ?? 'owner',
      },
    })
  }
  return { options: { plugins }, $context: Promise.resolve({}) } as never
}

function makeTestLayer(auth: unknown) {
  return AuthServiceLive.pipe(Layer.provide(Layer.succeed(BetterAuth, auth as never)))
}

function run(auth: unknown, fn: (svc: typeof AuthService.Service) => Effect.Effect<boolean>) {
  return expectSuccess(
    Effect.gen(function* () {
      const svc = yield* AuthService
      return yield* fn(svc)
    }).pipe(Effect.provide(makeTestLayer(auth))),
  )
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('authServiceLive — user branch', () => {
  beforeEach(() => vi.clearAllMocks())

  it('adminUserIds includes the caller → true', async () => {
    const auth = makeAuthStub({ adminUserIds: ['42'] })
    expect(await run(auth, svc => svc.hasPermission({ userId: '42' }, { user: ['set-role'] }))).toBe(true)
  })

  it('role authorizes the requested permission → true', async () => {
    const auth = makeAuthStub({ adminRoles: { admin: authorizeStub({ user: ['set-role', 'ban'] }) } })
    expect(await run(auth, svc => svc.hasPermission({ userId: '1', role: 'admin' }, { user: ['set-role'] }))).toBe(true)
  })

  it('no matching role → false', async () => {
    const auth = makeAuthStub({ adminRoles: { admin: authorizeStub({ user: ['read'] }) } })
    expect(await run(auth, svc => svc.hasPermission({ userId: '1', role: 'user' }, { user: ['set-role'] }))).toBe(false)
  })

  it('falls back to defaultRole when no role given', async () => {
    const auth = makeAuthStub({
      adminDefaultRole: 'editor',
      adminRoles: { editor: authorizeStub({ post: ['publish'] }) },
    })
    expect(await run(auth, svc => svc.hasPermission({ userId: '1' }, { post: ['publish'] }))).toBe(true)
  })
})

describe('authServiceLive — organization branch', () => {
  beforeEach(() => vi.clearAllMocks())

  it('org role authorizes → true (orgId + role present routes to org check)', async () => {
    const auth = makeAuthStub({ orgRoles: { manager: authorizeStub({ member: ['invite'] }) } })
    expect(await run(auth, svc =>
      svc.hasPermission({ userId: '1', organizationId: 'org-1', role: 'manager' }, { member: ['invite'] }))).toBe(true)
  })

  it('creator role + allowCreatorAllPermissions → true', async () => {
    const auth = makeAuthStub({ orgCreatorRole: 'owner', orgRoles: {} })
    expect(await run(auth, svc =>
      svc.hasPermission(
        { userId: '1', organizationId: 'org-1', role: 'owner' },
        { member: ['anything'] },
        { allowCreatorAllPermissions: true },
      ))).toBe(true)
  })

  it('non-creator without matching org role → false', async () => {
    const auth = makeAuthStub({ orgCreatorRole: 'owner', orgRoles: { member: authorizeStub({ member: ['read'] }) } })
    expect(await run(auth, svc =>
      svc.hasPermission({ userId: '1', organizationId: 'org-1', role: 'member' }, { member: ['invite'] }))).toBe(false)
  })
})
