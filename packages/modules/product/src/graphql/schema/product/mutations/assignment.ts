// Attribute-assignment mutations (Task 20b).
//
// Assigning a value to a product/variant is a GRAFT when `organizationId` is set
// and a BASE write when it is null. Authz switches on that null:
//   - base write → the user's global `product:update` perm;
//   - org graft  → that org's `product:update` perm.
//
// The discriminated `value` union arrives as a GraphQL input object with all
// member fields optional; `toAssignmentValue` narrows it to the service's
// `AssignmentValue` by presence. Exactly one member is expected — a malformed
// shape surfaces from the service as `ValueKindMismatch`.

import type { ProductGraphQLSchemaBuilder } from '@czo/product/graphql'
import type { AssignmentValue } from '../../../../services'
import { Effect } from 'effect'
import {
  AssignmentNotFound,
  AttributeAssignmentService,
  AttributeNotAssignedToType,
  ProductNotAdopted,
  ProductNotFound,
  ProductTypeNotFound,
  ValueKindMismatch,
  VariantNotFound,
} from '../../../../services'
import { loadProductOrganizationId, loadVariantOrganizationId } from '../authz'
import { sg } from '../subgraphs'

// A decoded relay global-id input value (Pothos relay plugin shape).
interface GID { typename: string, id: string }

/** Shape of the `AssignmentValueInput` after relay decoding. */
interface AssignmentValueInputShape {
  valueIds?: ReadonlyArray<number> | null
  numeric?: number | null
  text?: { plain: string, rich?: unknown | null } | null
  boolean?: boolean | null
  date?: Date | string | null
  file?: { fileUrl: string, mimetype: string } | null
}

/**
 * Narrow the all-optional GraphQL value input to the service's `AssignmentValue`
 * by member presence. Selects carry `valueIds`; scalars carry exactly one typed
 * field. A shape with no recognised member defaults to an empty select, which
 * the service rejects as `ValueKindMismatch`.
 */
function toAssignmentValue(value: AssignmentValueInputShape): AssignmentValue {
  if (value.valueIds != null)
    return { valueIds: value.valueIds }
  if (value.text != null)
    return { text: { plain: value.text.plain, rich: value.text.rich ?? null } }
  if (value.numeric != null)
    return { numeric: value.numeric }
  if (value.boolean != null)
    return { boolean: value.boolean }
  if (value.date != null)
    return { date: value.date instanceof Date ? value.date : new Date(value.date) }
  if (value.file != null)
    return { file: { fileUrl: value.file.fileUrl, mimetype: value.file.mimetype } }
  return { valueIds: [] }
}

/** Org gate for a graft input: null org → global perm; set → that org. */
function orgGate(organizationId: GID | null | undefined) {
  return organizationId == null
    ? { permission: { resource: 'product' as const, actions: ['update' as const] } }
    : { permission: { resource: 'product' as const, actions: ['update' as const], organization: Number(organizationId.id) } }
}

export function registerAssignmentMutations(builder: ProductGraphQLSchemaBuilder): void {
  // ── assignProductValue ─────────────────────────────────────────────────────
  builder.relayMutationField(
    'assignProductValue',
    {
      ...sg('org', 'admin').input,
      inputFields: t => ({
        productId: t.globalID({ for: 'Product', required: true, description: 'The Product node to assign the value onto.' }),
        organizationId: t.globalID({ for: 'Organization', required: false, description: 'When null the assignment is a global BASE write; when set it is an org GRAFT scoped to this Organization, requiring a live adoption if the product is global.' }),
        attributeId: t.int({ required: true, description: 'The attribute being assigned; it must be declared on the product\'s type.' }),
        value: t.field({ type: 'AssignmentValueInput', required: true, description: 'The value to assign: valueIds for select types, otherwise exactly one scalar member.' }),
      }),
    },
    {
      ...sg('org', 'admin').field,
      description: 'Assigns an attribute value onto a product. A BASE assignment (no organizationId) is global; an org GRAFT (organizationId set) requires a live adoption when the product is global.',
      errors: { types: [ProductNotFound, ProductNotAdopted, ProductTypeNotFound, AttributeNotAssignedToType, ValueKindMismatch], ...sg('org', 'admin').errorOpts },
      authScopes: (_parent, args) => orgGate(args.input.organizationId),
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const values = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* AttributeAssignmentService
            return yield* svc.assignProductValue({
              productId: Number(input.productId.id),
              organizationId: input.organizationId ? Number(input.organizationId.id) : null,
              attributeId: input.attributeId,
              value: toAssignmentValue(input.value),
            })
          }),
        )
        return { pivotIds: values.map(v => v.id) }
      },
    },
    { ...sg('org', 'admin').payload, outputFields: t => ({ pivotIds: t.intList({ resolve: p => p.pivotIds, description: 'The ids of the affected assignment pivot rows.' }) }) },
  )

  // ── assignVariantValue ─────────────────────────────────────────────────────
  builder.relayMutationField(
    'assignVariantValue',
    {
      ...sg('org', 'admin').input,
      inputFields: t => ({
        variantId: t.globalID({ for: 'ProductVariant', required: true, description: 'The ProductVariant node to assign the value onto.' }),
        organizationId: t.globalID({ for: 'Organization', required: false, description: 'When null the assignment is a global BASE write; when set it is an org GRAFT scoped to this Organization, requiring a live adoption if the variant\'s product is global.' }),
        attributeId: t.int({ required: true, description: 'The attribute being assigned; it must be declared on the product\'s type.' }),
        value: t.field({ type: 'AssignmentValueInput', required: true, description: 'The value to assign: valueIds for select types, otherwise exactly one scalar member.' }),
      }),
    },
    {
      ...sg('org', 'admin').field,
      description: 'Assigns an attribute value onto a product variant. A BASE assignment (no organizationId) is global; an org GRAFT (organizationId set) requires a live adoption when the product is global.',
      errors: { types: [ProductNotFound, ProductNotAdopted, ProductTypeNotFound, AttributeNotAssignedToType, ValueKindMismatch, VariantNotFound], ...sg('org', 'admin').errorOpts },
      authScopes: (_parent, args) => orgGate(args.input.organizationId),
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const values = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* AttributeAssignmentService
            return yield* svc.assignVariantValue({
              variantId: Number(input.variantId.id),
              organizationId: input.organizationId ? Number(input.organizationId.id) : null,
              attributeId: input.attributeId,
              value: toAssignmentValue(input.value),
            })
          }),
        )
        return { pivotIds: values.map(v => v.id) }
      },
    },
    { ...sg('org', 'admin').payload, outputFields: t => ({ pivotIds: t.intList({ resolve: p => p.pivotIds, description: 'The ids of the affected assignment pivot rows.' }) }) },
  )

  // ── unassignProductValue — gates on the PRODUCT's org ──────────────────────
  builder.relayMutationField(
    'unassignProductValue',
    {
      ...sg('org', 'admin').input,
      inputFields: t => ({
        pivotId: t.int({ required: true, description: 'The id of the assignment pivot row to remove. Select-type values keep the shared catalog row; scalar-type values delete the minted value row.' }),
        subjectId: t.int({ required: true, description: 'The id of the owning product, used only to resolve the authorization organization.' }),
      }),
    },
    {
      ...sg('org', 'admin').field,
      description: 'Removes an attribute value assignment from a product, identified by its pivot row id.',
      errors: { types: [AssignmentNotFound], ...sg('org', 'admin').errorOpts },
      authScopes: async (_parent, args, ctx) => {
        const organization = await loadProductOrganizationId(ctx, args.input.subjectId)
        if (organization == null)
          return { permission: { resource: 'product', actions: ['update'] } }
        return { permission: { resource: 'product', actions: ['update'], organization } }
      },
      resolve: async (_root, args, ctx) => {
        await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* AttributeAssignmentService
            yield* svc.unassignProductValue(args.input.pivotId)
          }),
        )
        return { success: true }
      },
    },
    { ...sg('org', 'admin').payload, outputFields: t => ({ success: t.boolean({ resolve: p => p.success, description: 'True when the assignment was removed.' }) }) },
  )

  // ── unassignVariantValue — gates on the VARIANT's org ──────────────────────
  builder.relayMutationField(
    'unassignVariantValue',
    {
      ...sg('org', 'admin').input,
      inputFields: t => ({
        pivotId: t.int({ required: true, description: 'The id of the assignment pivot row to remove. Select-type values keep the shared catalog row; scalar-type values delete the minted value row.' }),
        subjectId: t.int({ required: true, description: 'The id of the owning variant, used only to resolve the authorization organization.' }),
      }),
    },
    {
      ...sg('org', 'admin').field,
      description: 'Removes an attribute value assignment from a product variant, identified by its pivot row id.',
      errors: { types: [AssignmentNotFound], ...sg('org', 'admin').errorOpts },
      authScopes: async (_parent, args, ctx) => {
        const organization = await loadVariantOrganizationId(ctx, args.input.subjectId)
        if (organization == null)
          return { permission: { resource: 'product', actions: ['update'] } }
        return { permission: { resource: 'product', actions: ['update'], organization } }
      },
      resolve: async (_root, args, ctx) => {
        await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* AttributeAssignmentService
            yield* svc.unassignVariantValue(args.input.pivotId)
          }),
        )
        return { success: true }
      },
    },
    { ...sg('org', 'admin').payload, outputFields: t => ({ success: t.boolean({ resolve: p => p.success, description: 'True when the assignment was removed.' }) }) },
  )
}
