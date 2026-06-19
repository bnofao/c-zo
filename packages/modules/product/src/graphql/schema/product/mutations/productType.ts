// ProductType mutations (Task 20a).
//
// Dual authz (switch-on-null): a GLOBAL product type (organizationId null)
// gates on the user's global `product` perm; an org-owned one gates on that
// org. declare/undeclareAttribute gate on the *type's* scope, resolved from the
// type row.

import type { ProductGraphQLSchemaBuilder } from '@czo/product/graphql'
import { OptimisticLockError } from '@czo/kit/db'
import { Effect } from 'effect'
import {
  InvalidAttributeDeclaration,
  ProductTypeNotFound,
  ProductTypeService,
} from '../../../../services'
import { loadProductTypeOrganizationId, ownerScope } from '../authz'
import { productEnumRefs } from '../inputs'
import { sg } from '../subgraphs'

export function registerProductTypeMutations(builder: ProductGraphQLSchemaBuilder): void {
  const enums = productEnumRefs()
  // ── createProductType — PLATFORM (global pivot) ──────────────────────────────
  // Tier split (mirrors @czo/attribute): unqualified = GLOBAL (no org input,
  // global role); `createOrganizationProductType` = org-owned.
  builder.relayMutationField(
    'createProductType',
    {
      ...sg('admin').input,
      inputFields: t => ({
        name: t.string({ required: true, description: 'Human-readable display name of the product type.' }),
        slug: t.string({ required: true, description: 'URL-safe identifier for the product type.' }),
        isShippingRequired: t.boolean({ required: true, description: 'Whether products of this type are physical goods that require shipping.' }),
      }),
    },
    {
      ...sg('admin').field,
      description: 'Creates a GLOBAL product type, the pivot declaring which attributes apply to its products and variants. Gated on the global `product` create permission.',
      errors: { types: [], ...sg('admin').errorOpts },
      authScopes: () => ({ permission: { resource: 'product', actions: ['create'] } }),
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const productType = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* ProductTypeService
            return yield* svc.createType({
              organizationId: null,
              name: input.name,
              slug: input.slug,
              isShippingRequired: input.isShippingRequired,
            })
          }),
        )
        return { productType }
      },
    },
    { ...sg('admin').payload, outputFields: t => ({ productType: t.field({ type: 'ProductType', resolve: p => p.productType, description: 'The newly created global product type.' }) }) },
  )

  // ── createOrganizationProductType — ORG-owned pivot ──────────────────────────
  builder.relayMutationField(
    'createOrganizationProductType',
    {
      ...sg('org').input,
      inputFields: t => ({
        organizationId: t.globalID({ for: 'Organization', required: true, description: 'The Organization that will own the product type; gated on `product:create` in that organization.' }),
        name: t.string({ required: true, description: 'Human-readable display name of the product type.' }),
        slug: t.string({ required: true, description: 'URL-safe identifier for the product type.' }),
        isShippingRequired: t.boolean({ required: true, description: 'Whether products of this type are physical goods that require shipping.' }),
      }),
    },
    {
      ...sg('org').field,
      description: 'Creates an organization-owned product type, gated on `product:create` in the given organization.',
      errors: { types: [], ...sg('org').errorOpts },
      authScopes: (_parent, args) => ({ permission: { resource: 'product', actions: ['create'], organization: Number(args.input.organizationId.id) } }),
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const productType = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* ProductTypeService
            return yield* svc.createType({
              organizationId: Number(input.organizationId.id),
              name: input.name,
              slug: input.slug,
              isShippingRequired: input.isShippingRequired,
            })
          }),
        )
        return { productType }
      },
    },
    { ...sg('org').payload, outputFields: t => ({ productType: t.field({ type: 'ProductType', resolve: p => p.productType, description: 'The newly created organization-owned product type.' }) }) },
  )

  // ── updateProductType ──────────────────────────────────────────────────────
  builder.relayMutationField(
    'updateProductType',
    {
      ...sg('org', 'admin').input,
      inputFields: t => ({
        id: t.globalID({ for: 'ProductType', required: true, description: 'References the ProductType node to update.' }),
        version: t.int({ required: true, description: 'Expected current version for optimistic-lock concurrency control; the update fails if it no longer matches.' }),
        name: t.string({ description: 'New display name; omit to leave unchanged.' }),
        slug: t.string({ description: 'New URL-safe identifier; omit to leave unchanged.' }),
        isShippingRequired: t.boolean({ description: 'New shipping-required flag; omit to leave unchanged.' }),
      }),
    },
    {
      ...sg('org', 'admin').field,
      description: 'Updates a product type. Gates on the type\'s own scope: the global `product` permission for a GLOBAL type, or the owning organization otherwise.',
      errors: { types: [ProductTypeNotFound, OptimisticLockError], ...sg('org', 'admin').errorOpts },
      authScopes: async (_parent, args, ctx) => ownerScope(await loadProductTypeOrganizationId(ctx, Number(args.input.id.id)), ['update']),
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const productType = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* ProductTypeService
            return yield* svc.updateType({
              id: Number(input.id.id),
              version: input.version,
              name: input.name ?? undefined,
              slug: input.slug ?? undefined,
              isShippingRequired: input.isShippingRequired ?? undefined,
            })
          }),
        )
        return { productType }
      },
    },
    { ...sg('org', 'admin').payload, outputFields: t => ({ productType: t.field({ type: 'ProductType', resolve: p => p.productType, description: 'The updated product type.' }) }) },
  )

  // ── deleteProductType (soft delete) ────────────────────────────────────────
  builder.relayMutationField(
    'deleteProductType',
    {
      ...sg('org', 'admin').input,
      inputFields: t => ({
        id: t.globalID({ for: 'ProductType', required: true, description: 'References the ProductType node to soft-delete.' }),
        version: t.int({ required: true, description: 'Expected current version for optimistic-lock concurrency control; the deletion fails if it no longer matches.' }),
      }),
    },
    {
      ...sg('org', 'admin').field,
      description: 'Soft-deletes a product type. Gates on the type\'s own scope: the global `product` permission for a GLOBAL type, or the owning organization otherwise.',
      errors: { types: [ProductTypeNotFound, OptimisticLockError], ...sg('org', 'admin').errorOpts },
      authScopes: async (_parent, args, ctx) => ownerScope(await loadProductTypeOrganizationId(ctx, Number(args.input.id.id)), ['delete']),
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const productType = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* ProductTypeService
            return yield* svc.softDeleteType(Number(input.id.id), input.version)
          }),
        )
        return { productType }
      },
    },
    { ...sg('org', 'admin').payload, outputFields: t => ({ productType: t.field({ type: 'ProductType', resolve: p => p.productType, description: 'The soft-deleted product type.' }) }) },
  )

  // ── declareAttribute — gates on the TYPE's scope ───────────────────────────
  builder.relayMutationField(
    'declareAttribute',
    {
      ...sg('org', 'admin').input,
      inputFields: t => ({
        productTypeId: t.globalID({ for: 'ProductType', required: true, description: 'References the ProductType node the attribute is being attached to.' }),
        organizationId: t.globalID({ for: 'Organization', required: false, description: 'References an Organization node. When set this is an org GRAFT extension where that organization extends a typically-global type, gated on that org; when null it is a BASE declaration scoped to the type\'s own org or global scope.' }),
        attributeId: t.int({ required: true, description: 'Identifier of the attribute to declare on the type.' }),
        assignment: t.field({ type: enums.AttributeAssignment, required: true, description: 'Whether the attribute applies to the PRODUCT or to each VARIANT.' }),
        variantSelection: t.boolean({ required: true, description: 'Whether this attribute participates in the variant selection matrix.' }),
        position: t.int({ required: true, description: 'Ordering position of the attribute within the type\'s declarations.' }),
      }),
    },
    {
      ...sg('org', 'admin').field,
      description: 'Attaches an attribute to a product type. A BASE declaration (organizationId null) is scoped to the type\'s own org or global scope; an org GRAFT (organizationId set) lets that organization extend a typically-global type. Gates on the resulting scope.',
      errors: { types: [InvalidAttributeDeclaration], ...sg('org', 'admin').errorOpts },
      // An explicit `organizationId` makes this an org GRAFT onto the type → gate
      // on that org. Without it, it's a base declaration scoped to the type's own
      // org (global type → the user's global `product` perm).
      authScopes: async (_parent, args, ctx) => {
        const graftOrg = args.input.organizationId
        if (graftOrg != null)
          return { permission: { resource: 'product', actions: ['update'], organization: Number(graftOrg.id) } }
        return ownerScope(await loadProductTypeOrganizationId(ctx, Number(args.input.productTypeId.id)), ['update'])
      },
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const attribute = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* ProductTypeService
            const typeId = Number(input.productTypeId.id)
            const type = yield* svc.findTypeById(typeId)
            return yield* svc.declareAttribute({
              productTypeId: typeId,
              // Org graft when supplied; else inherit the type's own scope.
              organizationId: input.organizationId ? Number(input.organizationId.id) : type.organizationId,
              attributeId: input.attributeId,
              assignment: input.assignment as 'PRODUCT' | 'VARIANT',
              variantSelection: input.variantSelection,
              position: input.position,
            })
          }),
        )
        return { attribute }
      },
    },
    { ...sg('org', 'admin').payload, outputFields: t => ({ attribute: t.field({ type: 'ProductTypeAttribute', resolve: p => p.attribute, description: 'The resulting attribute declaration attached to the product type.' }) }) },
  )

  // ── undeclareAttribute ─────────────────────────────────────────────────────
  builder.relayMutationField(
    'undeclareAttribute',
    {
      ...sg('org', 'admin').input,
      inputFields: t => ({
        productTypeId: t.globalID({ for: 'ProductType', required: true, description: 'References the ProductType node the attribute declaration belongs to.' }),
        attributeAssignmentId: t.int({ required: true, description: 'Identifier of the attribute declaration to detach from the type.' }),
      }),
    },
    {
      ...sg('org', 'admin').field,
      description: 'Detaches an attribute declaration from a product type. Gates on the type\'s own scope: the global `product` permission for a GLOBAL type, or the owning organization otherwise.',
      errors: { types: [], ...sg('org', 'admin').errorOpts },
      authScopes: async (_parent, args, ctx) => ownerScope(await loadProductTypeOrganizationId(ctx, Number(args.input.productTypeId.id)), ['update']),
      resolve: async (_root, args, ctx) => {
        await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* ProductTypeService
            yield* svc.undeclareAttribute(args.input.attributeAssignmentId)
          }),
        )
        return { success: true }
      },
    },
    { ...sg('org', 'admin').payload, outputFields: t => ({ success: t.boolean({ resolve: p => p.success, description: 'True when the attribute declaration was detached.' }) }) },
  )
}
