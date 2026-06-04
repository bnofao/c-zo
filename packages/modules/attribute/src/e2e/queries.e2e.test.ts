/**
 * E2E tests for the attribute module's GraphQL QUERIES.
 *
 * Real app boot (Testcontainers Postgres), real authz — no mocks.
 *
 * Users / fixtures seeded once in a module-level `beforeAll`:
 *   - User A: platform manager (grantGlobalRole) + org X member (attribute:manager/viewer)
 *             Creates platform DROPDOWN attribute P, org-owned DROPDOWN attribute Q,
 *             seeds 2 values on P (platform) and 2 values on Q (org X).
 *   - User B: no relation to X, no global role.
 */
import type { AttributeHarness } from './harness'
import { encodeGlobalID } from '@czo/kit/graphql'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootAttributeApp } from './harness'

let h: AttributeHarness

beforeAll(async () => {
  h = await bootAttributeApp()
}, 180_000)
afterAll(async () => {
  await h?.close()
})

// ── Fixture state (populated in the setup describe block below) ──────────────

let aToken: string
let bToken: string
let aUserId: number

let orgGlobalId: string
let orgNumericId: number

let pAttrId: string // relay global id of the platform attribute P
let pAttrSlug: string
let qAttrId: string // relay global id of the org-owned attribute Q
let qAttrSlug: string

// ── GraphQL fragments ──────────────────────────────────────────────────────

const ATTR_QUERY = `
  query ($id: ID, $slug: String) {
    attribute(id: $id, slug: $slug) {
      id
      slug
      organizationId
    }
  }
`

const ATTRS_QUERY = `
  query ($organizationId: ID) {
    attributes(organizationId: $organizationId) {
      edges {
        node {
          id
          slug
          organizationId
        }
      }
    }
  }
`

const VALUES_QUERY = `
  query ($attrId: ID!, $organizationId: ID) {
    attribute(id: $attrId) {
      id
      values(organizationId: $organizationId) {
        totalCount
        edges {
          node {
            id
            value
          }
        }
      }
    }
  }
`

const CREATE_ATTRIBUTE = `
  mutation ($input: CreateAttributeInput!) {
    createAttribute(input: $input) {
      __typename
      ... on CreateAttributeSuccess {
        data {
          attribute { id slug organizationId }
        }
      }
    }
  }
`

const CREATE_VALUE = `
  mutation ($input: CreateAttributeValueInput!) {
    createAttributeValue(input: $input) {
      __typename
      ... on CreateAttributeValueSuccess {
        data {
          value { id value }
        }
      }
    }
  }
`

// ── Seed fixture ─────────────────────────────────────────────────────────────

describe('setup fixture', () => {
  it('seeds users, org, attributes and values', async () => {
    // 1. Users
    const a = await h.signUp('qa-a@example.com', 'User A', 'password-a-123')
    const b = await h.signUp('qa-b@example.com', 'User B', 'password-b-123')
    aToken = a.token
    bToken = b.token
    aUserId = a.userId

    // 2. Grant A a global platform-manager role + org with attribute access
    await h.grantGlobalRole(aUserId, 'attribute:manager')
    const org = await h.createOrgWithAttributeAccess(aToken, aUserId, 'Query Test Org', 'qt-org')
    orgGlobalId = org.orgGlobalId
    orgNumericId = org.orgNumericId

    // 3. Create platform DROPDOWN attribute P (no organizationId)
    const cp = await h.gql(CREATE_ATTRIBUTE, {
      input: { name: 'Platform Color', type: 'DROPDOWN' },
    }, aToken)
    expect(cp.errors, `createAttribute P: ${JSON.stringify(cp.errors)}`).toBeUndefined()
    expect(cp.data?.createAttribute?.__typename).toBe('CreateAttributeSuccess')
    pAttrId = cp.data?.createAttribute?.data?.attribute?.id
    pAttrSlug = cp.data?.createAttribute?.data?.attribute?.slug
    expect(pAttrId).toBeTruthy()
    expect(pAttrSlug).toBeTruthy()
    expect(cp.data?.createAttribute?.data?.attribute?.organizationId).toBeNull()

    // 4. Create org-owned DROPDOWN attribute Q in org X
    const cq = await h.gql(CREATE_ATTRIBUTE, {
      input: { organizationId: orgGlobalId, name: 'Org Size', type: 'DROPDOWN' },
    }, aToken)
    expect(cq.errors, `createAttribute Q: ${JSON.stringify(cq.errors)}`).toBeUndefined()
    expect(cq.data?.createAttribute?.__typename).toBe('CreateAttributeSuccess')
    qAttrId = cq.data?.createAttribute?.data?.attribute?.id
    qAttrSlug = cq.data?.createAttribute?.data?.attribute?.slug
    expect(qAttrId).toBeTruthy()
    expect(qAttrSlug).toBeTruthy()
    expect(cq.data?.createAttribute?.data?.attribute?.organizationId).toBe(orgNumericId)

    // 5. Seed 2 values on P (platform values, no organizationId)
    for (const v of ['Red', 'Blue']) {
      const r = await h.gql(CREATE_VALUE, {
        input: { attributeId: pAttrId, value: v },
      }, aToken)
      expect(r.errors, `createAttributeValue on P "${v}": ${JSON.stringify(r.errors)}`).toBeUndefined()
    }

    // 6. Seed 2 values on Q (org X values)
    for (const v of ['Small', 'Large']) {
      const r = await h.gql(CREATE_VALUE, {
        input: { attributeId: qAttrId, organizationId: orgGlobalId, value: v },
      }, aToken)
      expect(r.errors, `createAttributeValue on Q "${v}": ${JSON.stringify(r.errors)}`).toBeUndefined()
    }
  }, 120_000)
})

// ── attribute(id/slug) ────────────────────────────────────────────────────────

describe('attribute(id, slug) — single lookup', () => {
  it('platform attribute P read by user A via id — allowed, returns P with null organizationId', async () => {
    const res = await h.gql(ATTR_QUERY, { id: pAttrId }, aToken)
    expect(res.errors).toBeUndefined()
    expect(res.data?.attribute?.id).toBe(pAttrId)
    expect(res.data?.attribute?.slug).toBe(pAttrSlug)
    expect(res.data?.attribute?.organizationId).toBeNull()
  })

  it('org attribute Q read by user A via id — allowed (A has attribute:read in X)', async () => {
    const res = await h.gql(ATTR_QUERY, { id: qAttrId }, aToken)
    expect(res.errors).toBeUndefined()
    expect(res.data?.attribute?.id).toBe(qAttrId)
    expect(res.data?.attribute?.slug).toBe(qAttrSlug)
    expect(res.data?.attribute?.organizationId).toBe(orgNumericId)
  })

  it('org attribute Q read by user B via id — denied (B has no permission in X)', async () => {
    const res = await h.gql(ATTR_QUERY, { id: qAttrId }, bToken)
    expect(res.data?.attribute).toBeNull()
    expect(res.errors).toBeTruthy()
    expect((res.errors ?? []).length).toBeGreaterThan(0)
  })

  it('platform attribute P read by user B via id — denied (platform single-lookup requires global attribute:read; B has none)', async () => {
    // The `attribute(id)` authScope derives the org from the looked-up row:
    // platform (org=null) → `permission { resource: attribute, actions: [read] }` with
    // no `organization` → checked against the caller's GLOBAL role. B has no global role.
    const res = await h.gql(ATTR_QUERY, { id: pAttrId }, bToken)
    expect(res.data?.attribute).toBeNull()
    expect(res.errors).toBeTruthy()
    expect((res.errors ?? []).length).toBeGreaterThan(0)
  })

  it('platform attribute P read by user A via slug — returns P', async () => {
    const res = await h.gql(ATTR_QUERY, { slug: pAttrSlug }, aToken)
    expect(res.errors).toBeUndefined()
    expect(res.data?.attribute?.id).toBe(pAttrId)
    expect(res.data?.attribute?.slug).toBe(pAttrSlug)
  })

  it('non-existent id read by user A — resolves null with no errors (NotFound masked as null)', async () => {
    const fakeId = encodeGlobalID('Attribute', '999999')
    const res = await h.gql(ATTR_QUERY, { id: fakeId }, aToken)
    expect(res.data?.attribute).toBeNull()
    expect(res.errors).toBeUndefined()
  })
})

// ── attributes(...) connection ────────────────────────────────────────────────

describe('attributes connection', () => {
  it('user A queries with no org arg — platform rows only: contains P, not Q', async () => {
    const res = await h.gql(ATTRS_QUERY, {}, aToken)
    expect(res.errors).toBeUndefined()
    const edges = res.data?.attributes?.edges ?? []
    const slugs = edges.map((e: { node: { slug: string } }) => e.node.slug)
    expect(slugs).toContain(pAttrSlug)
    expect(slugs).not.toContain(qAttrSlug)
    expect(edges.length).toBeGreaterThanOrEqual(1)
  })

  it('user A queries with organizationId X — contains both P and Q', async () => {
    const res = await h.gql(ATTRS_QUERY, { organizationId: orgGlobalId }, aToken)
    expect(res.errors).toBeUndefined()
    const edges = res.data?.attributes?.edges ?? []
    const slugs = edges.map((e: { node: { slug: string } }) => e.node.slug)
    expect(slugs).toContain(pAttrSlug)
    expect(slugs).toContain(qAttrSlug)
  })

  it('user B queries with organizationId X — denied (B lacks attribute:read in X)', async () => {
    const res = await h.gql(ATTRS_QUERY, { organizationId: orgGlobalId }, bToken)
    // authScope denial: the connection field resolves to null, errors are non-empty.
    expect(res.errors).toBeTruthy()
    expect((res.errors ?? []).length).toBeGreaterThan(0)
    // The connection itself may be null or the entire data.attributes key may be absent.
    const conn = res.data?.attributes
    expect(conn == null).toBe(true)
  })

  it('user B queries with no org arg — denied (platform list requires global attribute:read; B has none)', async () => {
    // Hardened gate: listing platform rows now requires a GLOBAL `attribute:read`
    // role, matching the single `attribute(id)` lookup. B has no global role.
    const res = await h.gql(ATTRS_QUERY, {}, bToken)
    expect(res.errors).toBeTruthy()
    expect((res.errors ?? []).length).toBeGreaterThan(0)
    expect(res.data?.attributes == null).toBe(true)
  })
})

// ── Attribute.values connection ───────────────────────────────────────────────

describe('attribute.values connection', () => {
  it('user A reads Q values(organizationId: X) — returns the 2 seeded values', async () => {
    const res = await h.gql(VALUES_QUERY, {
      attrId: qAttrId,
      organizationId: orgGlobalId,
    }, aToken)
    expect(res.errors).toBeUndefined()
    expect(res.data?.attribute?.values?.totalCount).toBe(2)
    const vals = (res.data?.attribute?.values?.edges ?? []).map(
      (e: { node: { value: string } }) => e.node.value,
    ).sort()
    expect(vals).toEqual(['Large', 'Small'])
  })

  it('user B reads Q values(organizationId: X) — denied (B cannot read org X)', async () => {
    const res = await h.gql(VALUES_QUERY, {
      attrId: qAttrId,
      organizationId: orgGlobalId,
    }, bToken)
    // B is denied at the attribute level (row-derived read scope) or values level —
    // either way errors must be present and no value data leaked.
    expect(res.errors).toBeTruthy()
    expect((res.errors ?? []).length).toBeGreaterThan(0)
    // The values connection (if attribute even resolved) must be null.
    const valuesPayload = res.data?.attribute?.values ?? null
    if (valuesPayload !== null) {
      expect(valuesPayload).toBeNull()
    }
  })

  it('user A reads Q values with a different org relay id — denied (parent-aware: arg must equal Q\'s org)', async () => {
    // Encode a relay id for a non-existent org whose numeric id differs from X.
    const wrongOrgRelayId = encodeGlobalID('Organization', String(orgNumericId + 1))
    const res = await h.gql(VALUES_QUERY, {
      attrId: qAttrId,
      organizationId: wrongOrgRelayId,
    }, aToken)
    expect(res.errors).toBeTruthy()
    expect((res.errors ?? []).length).toBeGreaterThan(0)
    const valuesPayload = res.data?.attribute?.values ?? null
    if (valuesPayload !== null) {
      expect(valuesPayload).toBeNull()
    }
  })
})
