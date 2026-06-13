/**
 * E2E tests for attribute CRUD mutations (createAttribute, updateAttribute, deleteAttribute).
 *
 * Real app boot via Testcontainers, real authz — no mocks.
 * Boots ONE app in beforeAll, tears it down in afterAll.
 *
 * Authorization denial shape: when a Pothos scope-auth gate fires on a
 * mutation field, Yoga surfaces a top-level error AND the field key is
 * absent from `data` (i.e. `data.<field> === undefined`). This is different
 * from resolver-returned `null`; the assertions below use `.not.toBeDefined()`
 * to remain strict about the absence rather than silently accepting undefined.
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

// ── GraphQL document strings ────────────────────────────────────────────────

const CREATE_ATTRIBUTE = `
  mutation ($input: CreateAttributeInput!) {
    createAttribute(input: $input) {
      __typename
      ... on CreateAttributeSuccess {
        data { attribute { id slug type organizationId version } }
      }
      ... on AttributeSlugTakenError { message slug }
      ... on ReferenceEntityRequiredError { message }
      ... on ReferenceEntityNotAllowedError { message }
      ... on UnitNotAllowedError { message }
    }
  }
`

const CREATE_ORG_ATTRIBUTE = `
  mutation ($input: CreateOrganizationAttributeInput!) {
    createOrganizationAttribute(input: $input) {
      __typename
      ... on CreateOrganizationAttributeSuccess {
        data { attribute { id slug type organizationId version } }
      }
      ... on AttributeSlugTakenError { message slug }
      ... on ReferenceEntityRequiredError { message }
      ... on ReferenceEntityNotAllowedError { message }
      ... on UnitNotAllowedError { message }
    }
  }
`

const UPDATE_ATTRIBUTE = `
  mutation ($input: UpdateAttributeInput!) {
    updateAttribute(input: $input) {
      __typename
      ... on UpdateAttributeSuccess {
        data { attribute { id name version } }
      }
      ... on AttributeNotFoundError { message }
      ... on UnitNotAllowedError { message }
      ... on OptimisticLockError { message }
    }
  }
`

const DELETE_ATTRIBUTE = `
  mutation ($input: DeleteAttributeInput!) {
    deleteAttribute(input: $input) {
      __typename
      ... on DeleteAttributeSuccess {
        data { attribute { id } }
      }
      ... on AttributeNotFoundError { message }
    }
  }
`

// ── Suite ───────────────────────────────────────────────────────────────────
// User A: org member with attribute:manager+viewer in Attr Org; global role
//         attribute:manager,attribute:admin (create+update+delete on PLATFORM).
// User B: no org membership, no global role — used for denial assertions.

describe('attribute CRUD mutations', () => {
  let a: { token: string, userId: number }
  let b: { token: string, userId: number }
  let orgGlobalId: string
  let orgNumericId: number

  beforeAll(async () => {
    a = await h.signUp('attr-a@example.com', 'User A', 'password-a-123')
    b = await h.signUp('attr-b@example.com', 'User B', 'password-b-123')

    // Grant A a PLATFORM role BEFORE any session-cached request so the cache
    // is populated with the correct role from the first request onward.
    // attribute:manager → create+update; attribute:admin → delete.
    await h.grantGlobalRole(a.userId, 'attribute:manager,attribute:admin')

    // createOrgWithAttributeAccess uses A's token — the session will be read
    // fresh (cache miss) and see the newly set role.
    const org = await h.createOrgWithAttributeAccess(a.token, a.userId, 'Attr Org', 'attr-org')
    orgGlobalId = org.orgGlobalId
    orgNumericId = org.orgNumericId
  })

  // ── createAttribute ─────────────────────────────────────────────────────────

  describe('createAttribute', () => {
    it('platform happy: creates a global attribute with no organizationId', async () => {
      const result = await h.gql(
        CREATE_ATTRIBUTE,
        { input: { name: 'Material', type: 'DROPDOWN' } },
        a.token,
      )
      expect(result.errors).toBeUndefined()
      expect(result.data?.createAttribute?.__typename).toBe('CreateAttributeSuccess')
      const attr = result.data?.createAttribute?.data?.attribute
      expect(attr?.organizationId).toBeNull()
      expect(attr?.version).toBe(1)
      expect(typeof attr?.id).toBe('string')
      expect(typeof attr?.slug).toBe('string')
    })

    it('org happy: creates an org-owned attribute with organizationId', async () => {
      const result = await h.gql(
        CREATE_ORG_ATTRIBUTE,
        { input: { organizationId: orgGlobalId, name: 'Size', type: 'DROPDOWN' } },
        a.token,
      )
      expect(result.errors).toBeUndefined()
      expect(result.data?.createOrganizationAttribute?.__typename).toBe('CreateOrganizationAttributeSuccess')
      const attr = result.data?.createOrganizationAttribute?.data?.attribute
      expect(attr?.organizationId).toBe(orgNumericId)
      expect(attr?.version).toBe(1)
      expect(typeof attr?.id).toBe('string')
    })

    it('authz unauthenticated: no token yields top-level errors and field absent from data', async () => {
      const result = await h.gql(
        CREATE_ATTRIBUTE,
        { input: { name: 'Unauthenticated', type: 'DROPDOWN' } },
      )
      expect(result.errors).toBeTruthy()
      expect((result.errors ?? []).length).toBeGreaterThan(0)
      // Scope-auth denial: field is absent from data (not null — absent)
      expect(result.data?.createAttribute).not.toBeDefined()
    })

    it('authz cross-org: B (non-member) is denied — top-level errors and field absent from data', async () => {
      const result = await h.gql(
        CREATE_ORG_ATTRIBUTE,
        { input: { organizationId: orgGlobalId, name: 'CrossOrgAttr', type: 'DROPDOWN' } },
        b.token,
      )
      expect(result.errors).toBeTruthy()
      expect((result.errors ?? []).length).toBeGreaterThan(0)
      // Scope-auth denial: field is absent from data (not null — absent)
      expect(result.data?.createOrganizationAttribute).not.toBeDefined()
    })

    it('error slug taken: second create with same name returns AttributeSlugTakenError union member', async () => {
      // First create succeeds (slug will be 'duplicated-slug-attr').
      const first = await h.gql(
        CREATE_ATTRIBUTE,
        { input: { name: 'Duplicated Slug Attr', type: 'DROPDOWN' } },
        a.token,
      )
      expect(first.errors).toBeUndefined()
      expect(first.data?.createAttribute?.__typename).toBe('CreateAttributeSuccess')

      // Second create with the same name → same slug → union error member, NOT a top-level error.
      const second = await h.gql(
        CREATE_ATTRIBUTE,
        { input: { name: 'Duplicated Slug Attr', type: 'DROPDOWN' } },
        a.token,
      )
      expect(second.errors).toBeUndefined()
      expect(second.data?.createAttribute?.__typename).toBe('AttributeSlugTakenError')
      expect(typeof second.data?.createAttribute?.slug).toBe('string')
      expect(second.data?.createAttribute?.slug.length).toBeGreaterThan(0)
    })

    it('error reference invariant — REFERENCE without referenceEntity returns ReferenceEntityRequiredError', async () => {
      const result = await h.gql(
        CREATE_ATTRIBUTE,
        { input: { name: 'Brand', type: 'REFERENCE' } },
        a.token,
      )
      expect(result.errors).toBeUndefined()
      expect(result.data?.createAttribute?.__typename).toBe('ReferenceEntityRequiredError')
    })

    it('error reference invariant — non-REFERENCE with referenceEntity returns ReferenceEntityNotAllowedError', async () => {
      const result = await h.gql(
        CREATE_ATTRIBUTE,
        { input: { name: 'NotAReference', type: 'DROPDOWN', referenceEntity: 'product' } },
        a.token,
      )
      expect(result.errors).toBeUndefined()
      expect(result.data?.createAttribute?.__typename).toBe('ReferenceEntityNotAllowedError')
    })

    it('error unit invariant — non-NUMERIC with unit returns UnitNotAllowedError', async () => {
      const result = await h.gql(
        CREATE_ATTRIBUTE,
        { input: { name: 'UnitDropdown', type: 'DROPDOWN', unit: 'KILOGRAM' } },
        a.token,
      )
      expect(result.errors).toBeUndefined()
      expect(result.data?.createAttribute?.__typename).toBe('UnitNotAllowedError')
    })
  })

  // ── updateAttribute ─────────────────────────────────────────────────────────

  describe('updateAttribute', () => {
    it('happy path: updates name, version is incremented', async () => {
      const created = await h.gql(
        CREATE_ATTRIBUTE,
        { input: { name: 'UpdateMe', type: 'DROPDOWN' } },
        a.token,
      )
      expect(created.data?.createAttribute?.__typename).toBe('CreateAttributeSuccess')
      const attrId: string = created.data?.createAttribute?.data?.attribute?.id
      const attrVersion: number = created.data?.createAttribute?.data?.attribute?.version

      const updated = await h.gql(
        UPDATE_ATTRIBUTE,
        { input: { id: attrId, version: attrVersion, name: 'UpdatedName' } },
        a.token,
      )
      expect(updated.errors).toBeUndefined()
      expect(updated.data?.updateAttribute?.__typename).toBe('UpdateAttributeSuccess')
      const updatedAttr = updated.data?.updateAttribute?.data?.attribute
      expect(updatedAttr?.name).toBe('UpdatedName')
      expect(updatedAttr?.version).toBe(attrVersion + 1)
    })

    it('error optimistic lock: updating with a stale version returns OptimisticLockError union member', async () => {
      const created = await h.gql(
        CREATE_ATTRIBUTE,
        { input: { name: 'LockTest', type: 'DROPDOWN' } },
        a.token,
      )
      expect(created.data?.createAttribute?.__typename).toBe('CreateAttributeSuccess')
      const attrId: string = created.data?.createAttribute?.data?.attribute?.id
      const attrVersion: number = created.data?.createAttribute?.data?.attribute?.version

      // First update succeeds (version 1 → 2).
      const first = await h.gql(
        UPDATE_ATTRIBUTE,
        { input: { id: attrId, version: attrVersion, name: 'FirstUpdate' } },
        a.token,
      )
      expect(first.data?.updateAttribute?.__typename).toBe('UpdateAttributeSuccess')

      // Second update with the now-stale version → union error member, NOT a top-level error.
      const second = await h.gql(
        UPDATE_ATTRIBUTE,
        { input: { id: attrId, version: attrVersion, name: 'StaleUpdate' } },
        a.token,
      )
      expect(second.errors).toBeUndefined()
      expect(second.data?.updateAttribute?.__typename).toBe('OptimisticLockError')
    })

    it('authz: B updating A\'s org-owned attribute is denied — top-level errors and field absent from data', async () => {
      const created = await h.gql(
        CREATE_ORG_ATTRIBUTE,
        { input: { organizationId: orgGlobalId, name: 'BCannotUpdate', type: 'DROPDOWN' } },
        a.token,
      )
      expect(created.data?.createOrganizationAttribute?.__typename).toBe('CreateOrganizationAttributeSuccess')
      const attrId: string = created.data?.createOrganizationAttribute?.data?.attribute?.id
      const attrVersion: number = created.data?.createOrganizationAttribute?.data?.attribute?.version

      const result = await h.gql(
        UPDATE_ATTRIBUTE,
        { input: { id: attrId, version: attrVersion, name: 'BTriesToUpdate' } },
        b.token,
      )
      expect(result.errors).toBeTruthy()
      expect((result.errors ?? []).length).toBeGreaterThan(0)
      // Scope-auth denial: field is absent from data (not null — absent)
      expect(result.data?.updateAttribute).not.toBeDefined()
    })

    it('input validation: a wrong-type global id (Organization) is rejected at the input layer', async () => {
      // `id` is `t.globalID({ for: 'Attribute' })`, so a global id whose typename
      // is NOT 'Attribute' must fail coercion at the GraphQL boundary — a
      // top-level error, never a silently-decoded numeric id reaching the resolver.
      const wrongTypeId = encodeGlobalID('Organization', '1')
      const result = await h.gql(
        UPDATE_ATTRIBUTE,
        { input: { id: wrongTypeId, version: 1, name: 'WrongType' } },
        a.token,
      )
      expect(result.errors).toBeTruthy()
      expect((result.errors ?? []).length).toBeGreaterThan(0)
      // The mutation never resolved successfully.
      expect(result.data?.updateAttribute?.__typename).not.toBe('UpdateAttributeSuccess')
    })

    it('error not found: updating a non-existent id returns AttributeNotFoundError union member', async () => {
      const bogusId = encodeGlobalID('Attribute', '999999')
      const result = await h.gql(
        UPDATE_ATTRIBUTE,
        { input: { id: bogusId, version: 1, name: 'Ghost' } },
        a.token,
      )
      // Unknown row → auth: true → authenticated user passes auth gate → service
      // returns NotFound (not a 403). Domain error = union member, NOT a top-level error.
      expect(result.errors).toBeUndefined()
      expect(result.data?.updateAttribute?.__typename).toBe('AttributeNotFoundError')
    })
  })

  // ── deleteAttribute ─────────────────────────────────────────────────────────

  describe('deleteAttribute', () => {
    it('happy path: creates then deletes a platform attribute — returns the deleted id', async () => {
      const created = await h.gql(
        CREATE_ATTRIBUTE,
        { input: { name: 'DeleteMe', type: 'DROPDOWN' } },
        a.token,
      )
      expect(created.data?.createAttribute?.__typename).toBe('CreateAttributeSuccess')
      const attrId: string = created.data?.createAttribute?.data?.attribute?.id

      const deleted = await h.gql(
        DELETE_ATTRIBUTE,
        { input: { id: attrId } },
        a.token,
      )
      expect(deleted.errors).toBeUndefined()
      expect(deleted.data?.deleteAttribute?.__typename).toBe('DeleteAttributeSuccess')
      expect(deleted.data?.deleteAttribute?.data?.attribute?.id).toBe(attrId)
    })

    it('authz: B deleting A\'s org-owned attribute is denied — top-level errors and field absent from data', async () => {
      const created = await h.gql(
        CREATE_ORG_ATTRIBUTE,
        { input: { organizationId: orgGlobalId, name: 'BCannotDelete', type: 'DROPDOWN' } },
        a.token,
      )
      expect(created.data?.createOrganizationAttribute?.__typename).toBe('CreateOrganizationAttributeSuccess')
      const attrId: string = created.data?.createOrganizationAttribute?.data?.attribute?.id

      const result = await h.gql(
        DELETE_ATTRIBUTE,
        { input: { id: attrId } },
        b.token,
      )
      expect(result.errors).toBeTruthy()
      expect((result.errors ?? []).length).toBeGreaterThan(0)
      // Scope-auth denial: field is absent from data (not null — absent)
      expect(result.data?.deleteAttribute).not.toBeDefined()
    })

    it('error not found: deleting a non-existent id returns AttributeNotFoundError union member', async () => {
      const bogusId = encodeGlobalID('Attribute', '999999')
      const result = await h.gql(
        DELETE_ATTRIBUTE,
        { input: { id: bogusId } },
        a.token,
      )
      expect(result.errors).toBeUndefined()
      expect(result.data?.deleteAttribute?.__typename).toBe('AttributeNotFoundError')
    })
  })
})
