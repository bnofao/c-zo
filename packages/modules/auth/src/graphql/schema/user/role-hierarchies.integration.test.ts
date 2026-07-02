import type { AuthHarness } from '../../../e2e/harness'
import { decodeGlobalID } from '@czo/kit/graphql'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootAuthApp } from '../../../e2e/harness'

// ─── Real schema-execution coverage for the roleHierarchies query ────────────
// Boots the full module (bootAuthApp → bootTestApp) so the registered global
// role hierarchies (ADMIN_HIERARCHY, API_KEY_HIERARCHY, APPS_HIERARCHY — see
// `index.ts`'s `buildAccessLayer`) are actually seeded. The bare `AccessService`
// `layer` from `./access` starts with an EMPTY registry, so a service-level
// test against it could never assert the admin tiers.

const ROLE_HIERARCHIES = `query {
  roleHierarchies {
    name
    tiers { name }
  }
}`

// Mirrors `adminActor` in `resend-invitation.integration.test.ts`: signUp's
// sequential counter doesn't track the real DB id, so fetch it via `me`.
async function adminActor(h: AuthHarness, email: string) {
  const a = await h.signUp(email, 'Admin', 'password123!')
  const me = await h.gql('query { me { id } }', {}, a.token, a.ip)
  const numericId = Number(decodeGlobalID(me.data.me.id).id)
  await h.grantGlobalRole(numericId, 'admin')
  const re = await h.signIn(email, 'password123!', a.ip)
  const token = ((await re.json()) as { token: string }).token
  return { ...a, token }
}

describe('roleHierarchies (E2E)', () => {
  let h: AuthHarness
  beforeAll(async () => {
    h = await bootAuthApp()
  }, 120_000)
  afterAll(() => h.close())

  it('exposes the admin hierarchy tiers in cumulative order', async () => {
    const admin = await adminActor(h, 'role-hierarchies-admin-1@ex.com')

    const res = await h.gql(ROLE_HIERARCHIES, {}, admin.token, admin.ip)

    expect(res.errors).toBeUndefined()
    const hierarchies: { name: string, tiers: { name: string }[] }[] = res.data.roleHierarchies
    const adminHierarchy = hierarchies.find(hh => hh.name === 'admin')
    expect(adminHierarchy).toBeDefined()
    expect(adminHierarchy!.tiers.map(t => t.name)).toEqual(['admin:viewer', 'admin:manager', 'admin'])

    // Other global hierarchies are exposed too (not just `admin`).
    expect(hierarchies.some(hh => hh.name === 'apps')).toBe(true)

    // `organization` (per-membership) and `api-key` are excluded from the picker.
    expect(hierarchies.some(hh => hh.name === 'organization')).toBe(false)
    expect(hierarchies.some(hh => hh.name === 'api-key')).toBe(false)
  })
})
