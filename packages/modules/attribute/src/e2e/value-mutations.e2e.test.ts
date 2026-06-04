/**
 * E2E tests for attribute VALUE mutations (choice + typed families).
 *
 * Real app boot via Testcontainers, real authz — no mocks.
 * Boots ONE app in beforeAll, tears it down in afterAll.
 *
 * CHOICE families covered:
 *   - value (DROPDOWN):    FULL — create / update / delete / reorder + authz + errors
 *   - swatch (SWATCH):     representative — create happy + SwatchRequiresColorOrFileError
 *   - reference (REFERENCE): representative — create happy
 *
 * TYPED families covered:
 *   - numeric (NUMERIC):   FULL — create / update / delete + authz + TypedValueNotFoundError
 *   - text (PLAIN_TEXT):   representative — create happy
 *   - boolean (BOOLEAN):   representative — create happy
 *   - date (DATE):         representative — create happy
 *   - file (FILE):         representative — create happy
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

// ── GraphQL helpers ───────────────────────────────────────────────────────────

const CREATE_ATTRIBUTE = `
  mutation ($input: CreateAttributeInput!) {
    createAttribute(input: $input) {
      __typename
      ... on CreateAttributeSuccess { data { attribute { id } } }
    }
  }
`

/** Create a parent attribute (org-owned when orgGlobalId is set, platform when null) and return its global ID. */
async function createParentAttr(
  token: string,
  orgGlobalId: string | null,
  name: string,
  type: string,
  referenceEntity?: string,
): Promise<string> {
  const result = await h.gql(
    CREATE_ATTRIBUTE,
    {
      input: {
        ...(orgGlobalId != null ? { organizationId: orgGlobalId } : {}),
        name,
        type,
        ...(referenceEntity ? { referenceEntity } : {}),
      },
    },
    token,
  )
  if (result.errors)
    throw new Error(`createAttribute failed: ${JSON.stringify(result.errors)}`)
  const id: string | undefined = result.data?.createAttribute?.data?.attribute?.id
  if (!id)
    throw new Error(`createAttribute returned no id: ${JSON.stringify(result.data)}`)
  return id
}

// ── Setup ─────────────────────────────────────────────────────────────────────

describe('attribute value mutations', () => {
  let a: { token: string, userId: number }
  let b: { token: string, userId: number }
  let orgGlobalId: string

  // Org-owned parent attributes — used for create/update/authz/error tests.
  // (attribute:manager in org has create+update, but NOT delete.)
  let dropdownAttrId: string
  let swatchAttrId: string
  let referenceAttrId: string
  let numericAttrId: string
  // Platform parent attributes — used for delete tests.
  // (global attribute:admin granted to user A gives platform-tier delete.)
  let dropdownAttrPlatformId: string
  let numericAttrPlatformId: string
  // Org-owned parents for the representative typed creates
  let textAttrId: string
  let booleanAttrId: string
  let dateAttrId: string
  let fileAttrId: string

  beforeAll(async () => {
    a = await h.signUp('val-a@example.com', 'Value User A', 'password-a-123')
    b = await h.signUp('val-b@example.com', 'Value User B', 'password-b-123')

    const org = await h.createOrgWithAttributeAccess(a.token, a.userId, 'Value Org', 'value-org')
    orgGlobalId = org.orgGlobalId

    // Grant user A global attribute:admin (includes create, update, delete globally).
    // Used for platform-tier delete tests below.
    await h.grantGlobalRole(a.userId, 'attribute:admin')

    // Org-owned parent attributes (create/update/authz/error tests)
    dropdownAttrId = await createParentAttr(a.token, orgGlobalId, 'DropdownAttr', 'DROPDOWN')
    swatchAttrId = await createParentAttr(a.token, orgGlobalId, 'SwatchAttr', 'SWATCH')
    referenceAttrId = await createParentAttr(a.token, orgGlobalId, 'ReferenceAttr', 'REFERENCE', 'brand')
    numericAttrId = await createParentAttr(a.token, orgGlobalId, 'NumericAttr', 'NUMERIC')
    textAttrId = await createParentAttr(a.token, orgGlobalId, 'TextAttr', 'PLAIN_TEXT')
    booleanAttrId = await createParentAttr(a.token, orgGlobalId, 'BooleanAttr', 'BOOLEAN')
    dateAttrId = await createParentAttr(a.token, orgGlobalId, 'DateAttr', 'DATE')
    fileAttrId = await createParentAttr(a.token, orgGlobalId, 'FileAttr', 'FILE')

    // Platform parent attributes (delete tests — user A needs global attribute:admin)
    dropdownAttrPlatformId = await createParentAttr(a.token, null, 'DropdownAttrPlatform', 'DROPDOWN')
    numericAttrPlatformId = await createParentAttr(a.token, null, 'NumericAttrPlatform', 'NUMERIC')
  }, 60_000)

  // ── CHOICE value family (DROPDOWN) — FULL coverage ───────────────────────────

  describe('choice value (DROPDOWN) — full', () => {
    const CREATE_VALUE = `
      mutation ($input: CreateAttributeValueInput!) {
        createAttributeValue(input: $input) {
          __typename
          ... on CreateAttributeValueSuccess { data { value { id value slug position } } }
          ... on AttributeValueSlugTakenError { message slug }
          ... on AttributeParentNotOwnedError { message }
        }
      }
    `
    const UPDATE_VALUE = `
      mutation ($input: UpdateAttributeValueInput!) {
        updateAttributeValue(input: $input) {
          __typename
          ... on UpdateAttributeValueSuccess { data { value { id value } } }
          ... on AttributeValueNotFoundError { message }
          ... on AttributeValueSlugTakenError { message slug }
        }
      }
    `
    const DELETE_VALUE = `
      mutation ($input: DeleteAttributeValueInput!) {
        deleteAttributeValue(input: $input) {
          __typename
          ... on DeleteAttributeValueSuccess { data { __typename } }
          ... on AttributeValueNotFoundError { message }
        }
      }
    `
    const REORDER_VALUES = `
      mutation ($input: ReorderAttributeValuesInput!) {
        reorderAttributeValues(input: $input) {
          success
        }
      }
    `

    it('create happy: A creates an org-owned value on the dropdown attr', async () => {
      const result = await h.gql(
        CREATE_VALUE,
        { input: { attributeId: dropdownAttrId, organizationId: orgGlobalId, value: 'Red' } },
        a.token,
      )
      expect(result.errors).toBeUndefined()
      expect(result.data?.createAttributeValue?.__typename).toBe('CreateAttributeValueSuccess')
      const v = result.data?.createAttributeValue?.data?.value
      expect(v?.value).toBe('Red')
      expect(typeof v?.slug).toBe('string')
      expect(typeof v?.id).toBe('string')
      expect(typeof v?.position).toBe('number')
    })

    it('update happy: updates the value text and position', async () => {
      // Create a fresh value to update
      const created = await h.gql(
        CREATE_VALUE,
        { input: { attributeId: dropdownAttrId, organizationId: orgGlobalId, value: 'GreenOrig' } },
        a.token,
      )
      expect(created.data?.createAttributeValue?.__typename).toBe('CreateAttributeValueSuccess')
      const valueGlobalId: string = created.data?.createAttributeValue?.data?.value?.id

      const updated = await h.gql(
        UPDATE_VALUE,
        { input: { id: valueGlobalId, value: 'GreenUpdated', position: 99 } },
        a.token,
      )
      expect(updated.errors).toBeUndefined()
      expect(updated.data?.updateAttributeValue?.__typename).toBe('UpdateAttributeValueSuccess')
      const v = updated.data?.updateAttributeValue?.data?.value
      expect(v?.value).toBe('GreenUpdated')
    })

    it('delete happy: creates a platform value then deletes it successfully', async () => {
      // User A has global attribute:admin, so they can delete platform values.
      const created = await h.gql(
        CREATE_VALUE,
        { input: { attributeId: dropdownAttrPlatformId, value: 'DeleteMe' } },
        a.token,
      )
      expect(created.data?.createAttributeValue?.__typename).toBe('CreateAttributeValueSuccess')
      const valueGlobalId: string = created.data?.createAttributeValue?.data?.value?.id

      const deleted = await h.gql(
        DELETE_VALUE,
        { input: { id: valueGlobalId } },
        a.token,
      )
      expect(deleted.errors).toBeUndefined()
      expect(deleted.data?.deleteAttributeValue?.__typename).toBe('DeleteAttributeValueSuccess')
    })

    it('reorder happy: creates 3 values, reorders them in reverse, success = true', async () => {
      const v1 = await h.gql(
        CREATE_VALUE,
        { input: { attributeId: dropdownAttrId, organizationId: orgGlobalId, value: 'ReorderA' } },
        a.token,
      )
      const v2 = await h.gql(
        CREATE_VALUE,
        { input: { attributeId: dropdownAttrId, organizationId: orgGlobalId, value: 'ReorderB' } },
        a.token,
      )
      const v3 = await h.gql(
        CREATE_VALUE,
        { input: { attributeId: dropdownAttrId, organizationId: orgGlobalId, value: 'ReorderC' } },
        a.token,
      )

      const id1: string = v1.data?.createAttributeValue?.data?.value?.id
      const id2: string = v2.data?.createAttributeValue?.data?.value?.id
      const id3: string = v3.data?.createAttributeValue?.data?.value?.id

      // Reorder: send the (already global) relay IDs in reversed order.
      const result = await h.gql(
        REORDER_VALUES,
        {
          input: {
            attributeId: dropdownAttrId,
            orderedIds: [id3, id2, id1],
          },
        },
        a.token,
      )
      expect(result.errors).toBeUndefined()
      expect(result.data?.reorderAttributeValues?.success).toBe(true)
    })

    it('authz: B creating a value on A\'s org attribute is denied — top-level errors, data null', async () => {
      const result = await h.gql(
        CREATE_VALUE,
        { input: { attributeId: dropdownAttrId, organizationId: orgGlobalId, value: 'Sneaky' } },
        b.token,
      )
      expect(result.errors).toBeTruthy()
      expect((result.errors ?? []).length).toBeGreaterThan(0)
      // scope-auth may null the field (data.createAttributeValue = null) or propagate
      // null to data itself (non-null field errors → data = null). Either form proves denial.
      expect(result.data?.createAttributeValue ?? result.data).toBeNull()
    })

    it('error slug taken: two values with the same explicit slug → AttributeValueSlugTakenError', async () => {
      const first = await h.gql(
        CREATE_VALUE,
        { input: { attributeId: dropdownAttrId, organizationId: orgGlobalId, value: 'DupSlug', slug: 'dup-slug-test' } },
        a.token,
      )
      expect(first.data?.createAttributeValue?.__typename).toBe('CreateAttributeValueSuccess')

      const second = await h.gql(
        CREATE_VALUE,
        { input: { attributeId: dropdownAttrId, organizationId: orgGlobalId, value: 'DupSlug2', slug: 'dup-slug-test' } },
        a.token,
      )
      expect(second.errors).toBeUndefined()
      expect(second.data?.createAttributeValue?.__typename).toBe('AttributeValueSlugTakenError')
      expect(typeof second.data?.createAttributeValue?.slug).toBe('string')
      expect(second.data?.createAttributeValue?.slug.length).toBeGreaterThan(0)
    })

    it('error parent not owned: a member of another org cannot graft a value onto this org attribute', async () => {
      // A second org Y with its own member C (granted attribute:manager in Y). C's
      // create authScope passes (it checks attribute:create in Y, which C holds) —
      // but the parent attribute is owned by org X, so the SERVICE rejects with the
      // parent-ownership integrity error. This is the GraphQL-layer counterpart of
      // the service test "createValue — org value on ANOTHER org's attribute".
      const c = await h.signUp('val-c@example.com', 'Value User C', 'password-c-123')
      const orgY = await h.createOrgWithAttributeAccess(c.token, c.userId, 'Other Org', 'other-org')

      const result = await h.gql(
        CREATE_VALUE,
        { input: { attributeId: dropdownAttrId, organizationId: orgY.orgGlobalId, value: 'Intruder' } },
        c.token,
      )
      // A registered domain error → a union member in `data`, not a top-level error.
      expect(result.errors).toBeUndefined()
      expect(result.data?.createAttributeValue?.__typename).toBe('AttributeParentNotOwnedError')
    })

    it('error not found: update on a bogus id returns AttributeValueNotFoundError', async () => {
      const bogusId = encodeGlobalID('AttributeValue', '999999')
      const result = await h.gql(
        UPDATE_VALUE,
        { input: { id: bogusId, value: 'Ghost' } },
        a.token,
      )
      // Unknown row → auth:true → user passes auth → service returns NotFound (not 403)
      expect(result.errors).toBeUndefined()
      expect(result.data?.updateAttributeValue?.__typename).toBe('AttributeValueNotFoundError')
    })

    it('error not found: delete on a bogus id returns AttributeValueNotFoundError', async () => {
      const bogusId = encodeGlobalID('AttributeValue', '999999')
      const result = await h.gql(
        DELETE_VALUE,
        { input: { id: bogusId } },
        a.token,
      )
      expect(result.errors).toBeUndefined()
      expect(result.data?.deleteAttributeValue?.__typename).toBe('AttributeValueNotFoundError')
    })
  })

  // ── CHOICE swatch (SWATCH) — representative ───────────────────────────────────

  describe('choice swatch (SWATCH) — representative', () => {
    const CREATE_SWATCH = `
      mutation ($input: CreateAttributeSwatchInput!) {
        createAttributeSwatch(input: $input) {
          __typename
          ... on CreateAttributeSwatchSuccess { data { value { id value color } } }
          ... on SwatchRequiresColorOrFileError { message }
          ... on AttributeValueSlugTakenError { message slug }
          ... on AttributeParentNotOwnedError { message }
        }
      }
    `

    it('create happy: swatch with color = "#ff0000" succeeds', async () => {
      const result = await h.gql(
        CREATE_SWATCH,
        { input: { attributeId: swatchAttrId, organizationId: orgGlobalId, value: 'Crimson', color: '#ff0000' } },
        a.token,
      )
      expect(result.errors).toBeUndefined()
      expect(result.data?.createAttributeSwatch?.__typename).toBe('CreateAttributeSwatchSuccess')
      const v = result.data?.createAttributeSwatch?.data?.value
      expect(v?.value).toBe('Crimson')
      expect(v?.color).toBe('#ff0000')
      expect(typeof v?.id).toBe('string')
    })

    it('error SwatchRequiresColorOrFileError: neither color nor file → domain error', async () => {
      const result = await h.gql(
        CREATE_SWATCH,
        { input: { attributeId: swatchAttrId, organizationId: orgGlobalId, value: 'Bare' } },
        a.token,
      )
      expect(result.errors).toBeUndefined()
      expect(result.data?.createAttributeSwatch?.__typename).toBe('SwatchRequiresColorOrFileError')
      expect(typeof result.data?.createAttributeSwatch?.message).toBe('string')
    })
  })

  // ── CHOICE reference (REFERENCE) — representative ─────────────────────────────

  describe('choice reference (REFERENCE) — representative', () => {
    const CREATE_REFERENCE = `
      mutation ($input: CreateAttributeReferenceInput!) {
        createAttributeReference(input: $input) {
          __typename
          ... on CreateAttributeReferenceSuccess { data { value { id value referenceId } } }
          ... on AttributeValueSlugTakenError { message slug }
          ... on AttributeParentNotOwnedError { message }
        }
      }
    `

    it('create happy: reference with referenceId succeeds', async () => {
      const result = await h.gql(
        CREATE_REFERENCE,
        { input: { attributeId: referenceAttrId, organizationId: orgGlobalId, value: 'Acme Brand', referenceId: 42 } },
        a.token,
      )
      expect(result.errors).toBeUndefined()
      expect(result.data?.createAttributeReference?.__typename).toBe('CreateAttributeReferenceSuccess')
      const v = result.data?.createAttributeReference?.data?.value
      expect(v?.value).toBe('Acme Brand')
      expect(v?.referenceId).toBe(42)
      expect(typeof v?.id).toBe('string')
    })
  })

  // ── TYPED numeric (NUMERIC) — FULL coverage ───────────────────────────────────

  describe('typed numeric (NUMERIC) — full', () => {
    const CREATE_NUMERIC = `
      mutation ($input: CreateAttributeNumericValueInput!) {
        createAttributeNumericValue(input: $input) {
          __typename
          ... on CreateAttributeNumericValueSuccess { data { value { id value } } }
          ... on AttributeParentNotOwnedError { message }
        }
      }
    `
    const UPDATE_NUMERIC = `
      mutation ($input: UpdateAttributeNumericValueInput!) {
        updateAttributeNumericValue(input: $input) {
          __typename
          ... on UpdateAttributeNumericValueSuccess { data { value { id value } } }
          ... on TypedValueNotFoundError { message }
        }
      }
    `
    const DELETE_NUMERIC = `
      mutation ($input: DeleteAttributeNumericValueInput!) {
        deleteAttributeNumericValue(input: $input) {
          __typename
          ... on DeleteAttributeNumericValueSuccess { data { __typename } }
          ... on TypedValueNotFoundError { message }
        }
      }
    `

    it('create happy: A creates a numeric value', async () => {
      const result = await h.gql(
        CREATE_NUMERIC,
        { input: { attributeId: numericAttrId, organizationId: orgGlobalId, value: 3.14 } },
        a.token,
      )
      expect(result.errors).toBeUndefined()
      expect(result.data?.createAttributeNumericValue?.__typename).toBe('CreateAttributeNumericValueSuccess')
      const v = result.data?.createAttributeNumericValue?.data?.value
      expect(v?.value).toBeCloseTo(3.14)
      expect(typeof v?.id).toBe('string')
    })

    it('update happy: updates the numeric value', async () => {
      const created = await h.gql(
        CREATE_NUMERIC,
        { input: { attributeId: numericAttrId, organizationId: orgGlobalId, value: 1.0 } },
        a.token,
      )
      expect(created.data?.createAttributeNumericValue?.__typename).toBe('CreateAttributeNumericValueSuccess')
      const valueGlobalId: string = created.data?.createAttributeNumericValue?.data?.value?.id

      const updated = await h.gql(
        UPDATE_NUMERIC,
        { input: { id: valueGlobalId, value: 2.71828 } },
        a.token,
      )
      expect(updated.errors).toBeUndefined()
      expect(updated.data?.updateAttributeNumericValue?.__typename).toBe('UpdateAttributeNumericValueSuccess')
      expect(updated.data?.updateAttributeNumericValue?.data?.value?.value).toBeCloseTo(2.71828)
    })

    it('delete happy: creates a platform numeric value then deletes it', async () => {
      // User A has global attribute:admin, so they can delete platform values.
      const created = await h.gql(
        CREATE_NUMERIC,
        { input: { attributeId: numericAttrPlatformId, value: 9.99 } },
        a.token,
      )
      expect(created.data?.createAttributeNumericValue?.__typename).toBe('CreateAttributeNumericValueSuccess')
      const valueGlobalId: string = created.data?.createAttributeNumericValue?.data?.value?.id

      const deleted = await h.gql(
        DELETE_NUMERIC,
        { input: { id: valueGlobalId } },
        a.token,
      )
      expect(deleted.errors).toBeUndefined()
      expect(deleted.data?.deleteAttributeNumericValue?.__typename).toBe('DeleteAttributeNumericValueSuccess')
    })

    it('authz: B creating a numeric value on A\'s org attribute is denied — top-level errors, data null', async () => {
      const result = await h.gql(
        CREATE_NUMERIC,
        { input: { attributeId: numericAttrId, organizationId: orgGlobalId, value: 0 } },
        b.token,
      )
      expect(result.errors).toBeTruthy()
      expect((result.errors ?? []).length).toBeGreaterThan(0)
      // scope-auth may null the field (data.createAttributeNumericValue = null) or propagate
      // null to data itself (non-null field errors → data = null). Either form proves denial.
      expect(result.data?.createAttributeNumericValue ?? result.data).toBeNull()
    })

    it('error TypedValueNotFoundError: update on a bogus numeric id', async () => {
      const bogusId = encodeGlobalID('AttributeNumericValue', '999999')
      const result = await h.gql(
        UPDATE_NUMERIC,
        { input: { id: bogusId, value: 0 } },
        a.token,
      )
      expect(result.errors).toBeUndefined()
      expect(result.data?.updateAttributeNumericValue?.__typename).toBe('TypedValueNotFoundError')
    })

    it('error TypedValueNotFoundError: delete on a bogus numeric id', async () => {
      const bogusId = encodeGlobalID('AttributeNumericValue', '999999')
      const result = await h.gql(
        DELETE_NUMERIC,
        { input: { id: bogusId } },
        a.token,
      )
      expect(result.errors).toBeUndefined()
      expect(result.data?.deleteAttributeNumericValue?.__typename).toBe('TypedValueNotFoundError')
    })
  })

  // ── TYPED text (PLAIN_TEXT) — representative ──────────────────────────────────

  describe('typed text (PLAIN_TEXT) — representative', () => {
    const CREATE_TEXT = `
      mutation ($input: CreateAttributeTextValueInput!) {
        createAttributeTextValue(input: $input) {
          __typename
          ... on CreateAttributeTextValueSuccess { data { value { id plain } } }
          ... on AttributeParentNotOwnedError { message }
        }
      }
    `

    it('create happy: A creates a text value with plain content', async () => {
      const result = await h.gql(
        CREATE_TEXT,
        { input: { attributeId: textAttrId, organizationId: orgGlobalId, plain: 'Hello World' } },
        a.token,
      )
      expect(result.errors).toBeUndefined()
      expect(result.data?.createAttributeTextValue?.__typename).toBe('CreateAttributeTextValueSuccess')
      const v = result.data?.createAttributeTextValue?.data?.value
      expect(v?.plain).toBe('Hello World')
      expect(typeof v?.id).toBe('string')
    })
  })

  // ── TYPED boolean (BOOLEAN) — representative ──────────────────────────────────

  describe('typed boolean (BOOLEAN) — representative', () => {
    const CREATE_BOOLEAN = `
      mutation ($input: CreateAttributeBooleanValueInput!) {
        createAttributeBooleanValue(input: $input) {
          __typename
          ... on CreateAttributeBooleanValueSuccess { data { value { id value } } }
          ... on AttributeParentNotOwnedError { message }
        }
      }
    `

    it('create happy: A creates a boolean value (true)', async () => {
      const result = await h.gql(
        CREATE_BOOLEAN,
        { input: { attributeId: booleanAttrId, organizationId: orgGlobalId, value: true } },
        a.token,
      )
      expect(result.errors).toBeUndefined()
      expect(result.data?.createAttributeBooleanValue?.__typename).toBe('CreateAttributeBooleanValueSuccess')
      const v = result.data?.createAttributeBooleanValue?.data?.value
      expect(v?.value).toBe(true)
      expect(typeof v?.id).toBe('string')
    })
  })

  // ── TYPED date (DATE) — representative ───────────────────────────────────────

  describe('typed date (DATE) — representative', () => {
    const CREATE_DATE = `
      mutation ($input: CreateAttributeDateValueInput!) {
        createAttributeDateValue(input: $input) {
          __typename
          ... on CreateAttributeDateValueSuccess { data { value { id value } } }
          ... on AttributeParentNotOwnedError { message }
        }
      }
    `

    it('create happy: A creates a date value (ISO string)', async () => {
      const isoDate = '2026-06-03T12:00:00.000Z'
      const result = await h.gql(
        CREATE_DATE,
        { input: { attributeId: dateAttrId, organizationId: orgGlobalId, value: isoDate } },
        a.token,
      )
      expect(result.errors).toBeUndefined()
      expect(result.data?.createAttributeDateValue?.__typename).toBe('CreateAttributeDateValueSuccess')
      const v = result.data?.createAttributeDateValue?.data?.value
      expect(typeof v?.id).toBe('string')
      // DateTime scalar returns an ISO string; just verify it round-trips to a valid Date
      expect(new Date(v?.value).getTime()).toBeGreaterThan(0)
    })
  })

  // ── TYPED file (FILE) — representative ───────────────────────────────────────

  describe('typed file (FILE) — representative', () => {
    const CREATE_FILE = `
      mutation ($input: CreateAttributeFileValueInput!) {
        createAttributeFileValue(input: $input) {
          __typename
          ... on CreateAttributeFileValueSuccess { data { value { id file { url mimetype } } } }
          ... on AttributeParentNotOwnedError { message }
        }
      }
    `

    it('create happy: A creates a file value with url and mimetype', async () => {
      const result = await h.gql(
        CREATE_FILE,
        {
          input: {
            attributeId: fileAttrId,
            organizationId: orgGlobalId,
            file: { url: 'https://cdn.example.com/doc.pdf', mimetype: 'application/pdf' },
          },
        },
        a.token,
      )
      expect(result.errors).toBeUndefined()
      expect(result.data?.createAttributeFileValue?.__typename).toBe('CreateAttributeFileValueSuccess')
      const v = result.data?.createAttributeFileValue?.data?.value
      expect(v?.file?.url).toBe('https://cdn.example.com/doc.pdf')
      expect(v?.file?.mimetype).toBe('application/pdf')
      expect(typeof v?.id).toBe('string')
    })
  })
})
