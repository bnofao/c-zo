// E2E: an org-owned API key authenticates a request via the `x-api-key` header
// and satisfies the `permission` scope through its own `permissions` grid.
// Target field: `organization(id)` is gated on
// `{ permission: { resource: 'organization', actions: ['read'], organization } }`.

import type { AuthHarness } from './harness'
import { Effect } from 'effect'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ApiKeyService } from '../services/api-key'
import { bootAuthApp } from './harness'

const GRAPHQL_URL = 'http://localhost/graphql'
const ORG_READ = `query ($id: ID!) { organization(id: $id) { id slug } }`

// POST a GraphQL op with an optional `x-api-key` header and/or session bearer.
async function gql(
  app: AuthHarness['app'],
  query: string,
  variables: Record<string, unknown>,
  creds: { apiKey?: string, token?: string } = {},
): Promise<{ data?: any, errors?: any[] }> {
  const res = await app.fetch(new Request(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(creds.apiKey ? { 'x-api-key': creds.apiKey } : {}),
      ...(creds.token ? { authorization: `Bearer ${creds.token}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  }))
  return res.json() as Promise<{ data?: any, errors?: any[] }>
}

// Seed an org-owned key with the given grid; returns the one-time plaintext.
// `rateLimitEnabled: false` avoids the per-key cap across requests.
// `expiresIn` (seconds) < 0 mints an already-expired key.
function seedOrgKey(
  h: AuthHarness,
  referenceId: number,
  permissions: Record<string, string[]>,
  opts: { expiresIn?: number } = {},
): Promise<string> {
  return h.app.runEffect(Effect.gen(function* () {
    const svc = yield* ApiKeyService
    const { plain } = yield* svc.create(
      {
        name: 'sf',
        group: 'default',
        prefix: 'sf',
        referenceId,
        permissions,
        rateLimitEnabled: false,
        ...(opts.expiresIn !== undefined ? { expiresIn: opts.expiresIn } : {}),
      },
      { reference: 'organization' },
    )
    return plain
  }))
}

describe('api-key request auth (E2E)', () => {
  let h: AuthHarness
  let orgAGid: string
  let orgANum: number
  let adminToken: string // org-A owner session
  let keyA: string // org-A key, organization:read
  let keyB: string // org-B key, organization:read (cross-org)
  let wrongGridKeyA: string // org-A key, product:read only (no organization:read)
  let expiredKeyA: string // org-A key, already expired

  beforeAll(async () => {
    h = await bootAuthApp()
    const admin = await h.signUp('sf-admin@ex.com', 'Admin', 'password123!')
    adminToken = admin.token
    const a = await h.createOrganization(admin.token, 'Acme', 'acme', admin.ip)
    orgAGid = a.orgGlobalId
    orgANum = a.orgNumericId

    const bAdmin = await h.signUp('sf-b@ex.com', 'B', 'password123!')
    const b = await h.createOrganization(bAdmin.token, 'Bravo', 'bravo', bAdmin.ip)

    keyA = await seedOrgKey(h, orgANum, { organization: ['read'] })
    keyB = await seedOrgKey(h, b.orgNumericId, { organization: ['read'] })
    wrongGridKeyA = await seedOrgKey(h, orgANum, { product: ['read'] })
    expiredKeyA = await seedOrgKey(h, orgANum, { organization: ['read'] }, { expiresIn: -3600 })
  }, 120_000)

  afterAll(() => h.close())

  it('org-owned key with organization:read reads its own org (no session)', async () => {
    const res = await gql(h.app, ORG_READ, { id: orgAGid }, { apiKey: keyA })
    expect(res.errors).toBeUndefined()
    expect(res.data.organization.id).toBe(orgAGid)
  })

  it('cross-org: an org-B key cannot read org A', async () => {
    const res = await gql(h.app, ORG_READ, { id: orgAGid }, { apiKey: keyB })
    expect(res.data?.organization ?? null).toBeNull()
  })

  it('grid deny: an org-A key without organization:read is denied', async () => {
    const res = await gql(h.app, ORG_READ, { id: orgAGid }, { apiKey: wrongGridKeyA })
    expect(res.data?.organization ?? null).toBeNull()
  })

  it('expired key → anonymous → denied', async () => {
    const res = await gql(h.app, ORG_READ, { id: orgAGid }, { apiKey: expiredKeyA })
    expect(res.data?.organization ?? null).toBeNull()
  })

  it('no key → anonymous → denied', async () => {
    const res = await gql(h.app, ORG_READ, { id: orgAGid })
    expect(res.data?.organization ?? null).toBeNull()
  })

  it('precedence: a valid session wins over a (cross-org) key header', async () => {
    // The org-A owner reads org A with their session AND a cross-org key header;
    // the session must be used (success), not the key (which would deny).
    const res = await gql(h.app, ORG_READ, { id: orgAGid }, { token: adminToken, apiKey: keyB })
    expect(res.errors).toBeUndefined()
    expect(res.data.organization.id).toBe(orgAGid)
  })
})
