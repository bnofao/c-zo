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
import { loadProductTypeOrganizationId } from '../authz'
import { productEnumRefs } from '../inputs'

export function registerProductTypeMutations(builder: ProductGraphQLSchemaBuilder): void {
  const enums = productEnumRefs()
  // ── createProductType ──────────────────────────────────────────────────────
  builder.relayMutationField(
    'createProductType',
    {
      inputFields: t => ({
        organizationId: t.globalID({ for: 'Organization', required: false, description: 'References an Organization node. When null the product type is created as a GLOBAL pivot gated on the global `product` permission; when set it is owned by and gated on that organization.' }),
        name: t.string({ required: true, description: 'Human-readable display name of the product type.' }),
        slug: t.string({ required: true, description: 'URL-safe identifier for the product type.' }),
        isShippingRequired: t.boolean({ required: true, description: 'Whether products of this type are physical goods that require shipping.' }),
      }),
    },
    {
      description: 'Creates a product type, the pivot declaring which attributes apply to its products and variants. Creates a GLOBAL type when organizationId is null, otherwise an organization-owned one.',
      errors: { types: [] },
      authScopes: (_parent, args) =>
        args.input.organizationId == null
          ? { permission: { resource: 'product', actions: ['create'] } }
          : { permission: { resource: 'product', actions: ['create'], organization: Number(args.input.organizationId.id) } },
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const productType = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* ProductTypeService
            return yield* svc.createType({
              organizationId: input.organizationId ? Number(input.organizationId.id) : null,
              name: input.name,
              slug: input.slug,
              isShippingRequired: input.isShippingRequired,
            })
          }),
        )
        return { productType }
      },
    },
    { outputFields: t => ({ productType: t.field({ type: 'ProductType', resolve: p => p.productType, description: 'The newly created product type.' }) }) },
  )

  // ── updateProductType ──────────────────────────────────────────────────────
  builder.relayMutationField(
    'updateProductType',
    {
      inputFields: t => ({
        id: t.globalID({ for: 'ProductType', required: true, description: 'References the ProductType node to update.' }),
        version: t.int({ required: true, description: 'Expected current version for optimistic-lock concurrency control; the update fails if it no longer matches.' }),
        name: t.string({ description: 'New display name; omit to leave unchanged.' }),
        slug: t.string({ description: 'New URL-safe identifier; omit to leave unchanged.' }),
        isShippingRequired: t.boolean({ description: 'New shipping-required flag; omit to leave unchanged.' }),
      }),
    },
    {
      description: 'Updates a product type. Gates on the type\'s own scope: the global `product` permission for a GLOBAL type, or the owning organization otherwise.',
      errors: { types: [ProductTypeNotFound, OptimisticLockError] },
      authScopes: async (_parent, args, ctx) => {
        const organization = await loadProductTypeOrganizationId(ctx, Number(args.input.id.id))
        if (organization == null)
          return { permission: { resource: 'product', actions: ['update'] } }
        return { permission: { resource: 'product', actions: ['update'], organization } }
      },
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
    { outputFields: t => ({ productType: t.field({ type: 'ProductType', resolve: p => p.productType, description: 'The updated product type.' }) }) },
  )

  // ── deleteProductType (soft delete) ────────────────────────────────────────
  builder.relayMutationField(
    'deleteProductType',
    {
      inputFields: t => ({
        id: t.globalID({ for: 'ProductType', required: true, description: 'References the ProductType node to soft-delete.' }),
        version: t.int({ required: true, description: 'Expected current version for optimistic-lock concurrency control; the deletion fails if it no longer matches.' }),
      }),
    },
    {
      description: 'Soft-deletes a product type. Gates on the type\'s own scope: the global `product` permission for a GLOBAL type, or the owning organization otherwise.',
      errors: { types: [ProductTypeNotFound, OptimisticLockError] },
      authScopes: async (_parent, args, ctx) => {
        const organization = await loadProductTypeOrganizationId(ctx, Number(args.input.id.id))
        if (organization == null)
          return { permission: { resource: 'product', actions: ['delete'] } }
        return { permission: { resource: 'product', actions: ['delete'], organization } }
      },
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
    { outputFields: t => ({ productType: t.field({ type: 'ProductType', resolve: p => p.productType, description: 'The soft-deleted product type.' }) }) },
  )

  // ── declareAttribute — gates on the TYPE's scope ───────────────────────────
  builder.relayMutationField(
    'declareAttribute',
    {
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
      description: 'Attaches an attribute to a product type. A BASE declaration (organizationId null) is scoped to the type\'s own org or global scope; an org GRAFT (organizationId set) lets that organization extend a typically-global type. Gates on the resulting scope.',
      errors: { types: [InvalidAttributeDeclaration] },
      // An explicit `organizationId` makes this an org GRAFT onto the type → gate
      // on that org. Without it, it's a base declaration scoped to the type's own
      // org (global type → the user's global `product` perm).
      authScopes: async (_parent, args, ctx) => {
        const graftOrg = args.input.organizationId
        if (graftOrg != null)
          return { permission: { resource: 'product', actions: ['update'], organization: Number(graftOrg.id) } }
        const organization = await loadProductTypeOrganizationId(ctx, Number(args.input.productTypeId.id))
        if (organization == null)
          return { permission: { resource: 'product', actions: ['update'] } }
        return { permission: { resource: 'product', actions: ['update'], organization } }
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
    { outputFields: t => ({ attribute: t.field({ type: 'ProductTypeAttribute', resolve: p => p.attribute, description: 'The resulting attribute declaration attached to the product type.' }) }) },
  )

  // ── undeclareAttribute ─────────────────────────────────────────────────────
  builder.relayMutationField(
    'undeclareAttribute',
    {
      inputFields: t => ({
        productTypeId: t.globalID({ for: 'ProductType', required: true, description: 'References the ProductType node the attribute declaration belongs to.' }),
        attributeAssignmentId: t.int({ required: true, description: 'Identifier of the attribute declaration to detach from the type.' }),
      }),
    },
    {
      description: 'Detaches an attribute declaration from a product type. Gates on the type\'s own scope: the global `product` permission for a GLOBAL type, or the owning organization otherwise.',
      errors: { types: [] },
      authScopes: async (_parent, args, ctx) => {
        const organization = await loadProductTypeOrganizationId(ctx, Number(args.input.productTypeId.id))
        if (organization == null)
          return { permission: { resource: 'product', actions: ['update'] } }
        return { permission: { resource: 'product', actions: ['update'], organization } }
      },
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
    { outputFields: t => ({ success: t.boolean({ resolve: p => p.success, description: 'True when the attribute declaration was detached.' }) }) },
  )
}
