/**
 * E2E — relay `node(id:)`/`nodes(ids:)` authorization for the attribute domain,
 * enforced by the kit node-guard registry (`graphql/node-guards.ts`). Both the
 * `Attribute` node and the value nodes are gated the same way: a cross-org caller
 * gets the node resolved to null (existence not leaked), the owner gets the row.
 *
 * Boots the REAL app ([auth, attribute]) on a Testcontainers Postgres via the
 * shared `bootAttributeApp` harness and drives the REAL fetch handler. No mocks,
 * no stubbed authz.
 */
import type { AttributeHarness } from './harness'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootAttributeApp } from './harness'

let h: AttributeHarness

beforeAll(async () => {
  h = await bootAttributeApp()
}, 180_000)
afterAll(async () => {
  await h?.close()
})

describe('node(id:) authz on the Attribute node (kit nodeGuards registry)', () => {
  it('denies a cross-org caller reading an org-owned Attribute via node(id:), allows the owner', async () => {
    // 0. Smoke: boot + fetch + cross-package Tag identity.
    const smoke = await h.gql('{ __typename }')
    expect(smoke.data?.__typename).toBe('Query')

    // 1-3. User A creates org X and is granted attribute access in it.
    const a = await h.signUp('a@example.com', 'User A', 'password-a-123')
    const { orgGlobalId, orgNumericId } = await h.createOrgWithAttributeAccess(a.token, a.userId, 'Org X', 'org-x')

    // 4. createOrganizationAttribute(organizationId: X, DROPDOWN) as A → org-owned attribute.
    const createAttr = await h.gql(
      `mutation ($input: CreateOrganizationAttributeInput!) {
        createOrganizationAttribute(input: $input) {
          __typename
          ... on CreateOrganizationAttributeSuccess { data { attribute { id slug organizationId } } }
        }
      }`,
      { input: { organizationId: orgGlobalId, name: 'Color', type: 'DROPDOWN' } },
      a.token,
    )
    expect(createAttr.errors).toBeUndefined()
    expect(createAttr.data?.createOrganizationAttribute?.__typename).toBe('CreateOrganizationAttributeSuccess')
    const attrNodeId: string | undefined = createAttr.data?.createOrganizationAttribute?.data?.attribute?.id
    const createdSlug: string | undefined = createAttr.data?.createOrganizationAttribute?.data?.attribute?.slug
    expect(attrNodeId).toBeTruthy()
    expect(createdSlug).toBeTruthy()
    // Sanity: the attribute is genuinely org-owned (the cross-org gate's premise).
    expect(createAttr.data?.createOrganizationAttribute?.data?.attribute?.organizationId).toBe(orgNumericId)

    // 5. User B — no relation to X.
    const b = await h.signUp('b@example.com', 'User B', 'password-b-123')

    const NODE_QUERY = `query ($id: ID!) {
      node(id: $id) { __typename ... on Attribute { slug } }
    }`
    const asB = await h.gql(NODE_QUERY, { id: attrNodeId }, b.token)
    const asA = await h.gql(NODE_QUERY, { id: attrNodeId }, a.token)

    // THE SECURITY ASSERTION. B must be denied: the node guard resolves the node
    // to null (no error → a denied node is indistinguishable from not-found, so
    // existence is not leaked). No attribute data reaches B.
    expect(asB.data?.node, 'cross-org node(id:) must resolve to null for User B').toBeNull()
    expect(asB.data?.node?.slug, 'no attribute data may leak to a stranger').toBeUndefined()

    // A's read: the legitimate owner-side path is allowed.
    expect(asA.errors, `User A read should succeed: ${JSON.stringify(asA.errors)}`).toBeUndefined()
    expect(asA.data?.node?.slug).toBe(createdSlug)
  }, 120_000)
})

// Values are relay `drizzleNode`s (so their ids round-trip through mutations),
// which makes them reachable via `node(id:)`. The kit node-guard registry closes
// that path for org-owned values WITHOUT touching the per-type connections.
describe('node(id:) authz on value nodes (kit nodeGuards registry)', () => {
  it('denies a cross-org caller reading an org-owned AttributeValue via node(id:), allows the owner', async () => {
    // Owner A: org Y + an org-owned DROPDOWN attribute + a value on it.
    const owner = await h.signUp('value-owner@example.com', 'Value Owner', 'password-vo-123')
    const { orgGlobalId } = await h.createOrgWithAttributeAccess(owner.token, owner.userId, 'Value Org Y', 'value-org-y')

    const attr = await h.gql(
      `mutation ($input: CreateOrganizationAttributeInput!) {
        createOrganizationAttribute(input: $input) { ... on CreateOrganizationAttributeSuccess { data { attribute { id } } } }
      }`,
      { input: { organizationId: orgGlobalId, name: 'Finish', type: 'DROPDOWN' } },
      owner.token,
    )
    const attributeId: string = attr.data?.createOrganizationAttribute?.data?.attribute?.id
    expect(attributeId).toBeTruthy()

    const value = await h.gql(
      `mutation ($input: CreateAttributeValueInput!) {
        createAttributeValue(input: $input) { ... on CreateAttributeValueSuccess { data { value { id value } } } }
      }`,
      { input: { attributeId, organizationId: orgGlobalId, value: 'Matte' } },
      owner.token,
    )
    const valueNodeId: string = value.data?.createAttributeValue?.data?.value?.id
    expect(valueNodeId).toBeTruthy()

    // Stranger B — no relation to org Y.
    const stranger = await h.signUp('value-stranger@example.com', 'Value Stranger', 'password-vs-123')

    const NODE_QUERY = `query ($id: ID!) {
      node(id: $id) { __typename ... on AttributeValue { value } }
    }`
    const asStranger = await h.gql(NODE_QUERY, { id: valueNodeId }, stranger.token)
    const asOwner = await h.gql(NODE_QUERY, { id: valueNodeId }, owner.token)

    // The guard denies the stranger by resolving the node to NULL — no error,
    // so a denied node is indistinguishable from a non-existent one (existence is
    // not leaked). The security property is simply: no value data reaches B.
    expect(asStranger.data?.node, 'cross-org node(value) must resolve to null').toBeNull()
    expect(asStranger.data?.node?.value, 'no value data may leak to a stranger').toBeUndefined()

    // …and allow the owner (member with attribute:read in org Y).
    expect(asOwner.errors, `owner read should succeed: ${JSON.stringify(asOwner.errors)}`).toBeUndefined()
    expect(asOwner.data?.node?.value).toBe('Matte')
  }, 120_000)
})

// A platform (global) attribute requires GLOBAL `attribute:read` via node() — the
// same scope as `attribute(id)`/`attributes`, so node() is not a weaker path.
// In particular, org membership alone must NOT grant a platform read.
describe('node(id:) on a platform (global) Attribute (kit nodeGuards registry)', () => {
  it('requires global attribute:read: allows a global reader, denies an org-member-without-global-role and a roleless user', async () => {
    // Creator with a GLOBAL role makes a platform attribute (no organizationId).
    const creator = await h.signUp('plat-creator@example.com', 'Platform Creator', 'password-pc-123')
    await h.grantGlobalRole(creator.userId, 'attribute:manager') // global create
    const created = await h.gql(
      `mutation ($input: CreateAttributeInput!) {
        createAttribute(input: $input) {
          ... on CreateAttributeSuccess { data { attribute { id slug organizationId } } }
        }
      }`,
      { input: { name: 'Material', type: 'DROPDOWN' } },
      creator.token,
    )
    expect(created.errors).toBeUndefined()
    const platformNodeId: string = created.data?.createAttribute?.data?.attribute?.id
    const platformSlug: string = created.data?.createAttribute?.data?.attribute?.slug
    expect(platformNodeId).toBeTruthy()
    // Sanity: the attribute is genuinely platform-tier (the premise of this test).
    expect(created.data?.createAttribute?.data?.attribute?.organizationId).toBeNull()

    const NODE_QUERY = `query ($id: ID!) {
      node(id: $id) { __typename ... on Attribute { slug } }
    }`

    // Global reader — holds global `attribute:read` (viewer) → ALLOWED.
    const globalReader = await h.signUp('plat-global@example.com', 'Global Reader', 'password-gr-123')
    await h.grantGlobalRole(globalReader.userId, 'attribute:viewer')
    const asGlobal = await h.gql(NODE_QUERY, { id: platformNodeId }, globalReader.token)
    expect(asGlobal.errors, `global reader should succeed: ${JSON.stringify(asGlobal.errors)}`).toBeUndefined()
    expect(asGlobal.data?.node?.slug).toBe(platformSlug)

    // Org member — has `attribute:read` IN their own org but NO global role →
    // DENIED. Org membership must not grant a platform read (consistent with the
    // hardened `attribute(id)`/`attributes` queries).
    const orgMember = await h.signUp('plat-member@example.com', 'Org Member', 'password-om-123')
    await h.createOrgWithAttributeAccess(orgMember.token, orgMember.userId, 'Member Org', 'member-org')
    const asMember = await h.gql(NODE_QUERY, { id: platformNodeId }, orgMember.token)
    expect(asMember.data?.node, 'an org member without a global role must not read a platform attribute via node()').toBeNull()

    // Roleless authenticated user → DENIED.
    const roleless = await h.signUp('plat-norole@example.com', 'No Role', 'password-nr-123')
    const asRoleless = await h.gql(NODE_QUERY, { id: platformNodeId }, roleless.token)
    expect(asRoleless.data?.node, 'a roleless user must not read a platform attribute via node()').toBeNull()
  }, 120_000)
})
