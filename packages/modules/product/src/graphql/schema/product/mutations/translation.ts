// Translation mutations (Task 20b).
//
// A translation localises an entity's base fields, so it inherits the entity's
// authz scope: a translation of a GLOBAL entity (org null) requires the user's
// global `product:update` perm; a translation of an org-owned entity requires
// that org's perm. The owning org is resolved from the entity row via the
// matching `load*OrganizationId` loader (null → global). Variant translations
// derive their scope from the parent product (via the variant's own org).

import type { ProductGraphQLSchemaBuilder } from '@czo/product/graphql'
import { Effect } from 'effect'
import { TranslationService } from '../../../../services'
import {
  loadCategoryOrganizationId,
  loadCollectionOrganizationId,
  loadProductOrganizationId,
  loadVariantOrganizationId,
} from '../authz'

/** Build the dual scope from a resolved entity org (null → global perm). */
function scopeFor(organization: number | null) {
  if (organization == null)
    return { permission: { resource: 'product' as const, actions: ['update' as const] } }
  return { permission: { resource: 'product' as const, actions: ['update' as const], organization } }
}

export function registerTranslationMutations(builder: ProductGraphQLSchemaBuilder): void {
  // ── Product translations ───────────────────────────────────────────────────
  builder.relayMutationField(
    'upsertProductTranslation',
    {
      inputFields: t => ({
        productId: t.globalID({
          for: 'Product',
          required: true,
          description: 'Global ID of the Product node whose translation is being written.',
        }),
        localeCode: t.string({
          required: true,
          description: 'Registered locale code identifying which language this translation targets.',
        }),
        name: t.string({ required: true, description: 'Localized product name for this locale.' }),
        description: t.string({ description: 'Optional localized product description for this locale.' }),
      }),
    },
    {
      description:
        'Creates or updates the localized translation of a product\'s name and description for the given locale.',
      errors: { types: [] },
      authScopes: async (_parent, args, ctx) =>
        scopeFor(await loadProductOrganizationId(ctx, Number(args.input.productId.id))),
      resolve: async (_root, args, ctx) => {
        const input = args.input
        await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* TranslationService
            yield* svc.upsertProductTranslation({
              productId: Number(input.productId.id),
              localeCode: input.localeCode,
              name: input.name,
              description: input.description ?? undefined,
            })
          }),
        )
        return { success: true }
      },
    },
    {
      outputFields: t => ({
        success: t.boolean({
          resolve: p => p.success,
          description: 'True when the translation operation completed successfully.',
        }),
      }),
    },
  )

  builder.relayMutationField(
    'removeProductTranslation',
    {
      inputFields: t => ({
        productId: t.globalID({
          for: 'Product',
          required: true,
          description: 'Global ID of the Product node whose translation is being removed.',
        }),
        localeCode: t.string({
          required: true,
          description: 'Registered locale code identifying which translation to delete.',
        }),
      }),
    },
    {
      description: 'Deletes the localized translation row of a product for the given locale.',
      errors: { types: [] },
      authScopes: async (_parent, args, ctx) =>
        scopeFor(await loadProductOrganizationId(ctx, Number(args.input.productId.id))),
      resolve: async (_root, args, ctx) => {
        const input = args.input
        await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* TranslationService
            yield* svc.removeProductTranslation({ productId: Number(input.productId.id), localeCode: input.localeCode })
          }),
        )
        return { success: true }
      },
    },
    {
      outputFields: t => ({
        success: t.boolean({
          resolve: p => p.success,
          description: 'True when the translation operation completed successfully.',
        }),
      }),
    },
  )

  // ── Category translations ──────────────────────────────────────────────────
  builder.relayMutationField(
    'upsertCategoryTranslation',
    {
      inputFields: t => ({
        categoryId: t.globalID({
          for: 'Category',
          required: true,
          description: 'Global ID of the Category node whose translation is being written.',
        }),
        localeCode: t.string({
          required: true,
          description: 'Registered locale code identifying which language this translation targets.',
        }),
        name: t.string({ required: true, description: 'Localized category name for this locale.' }),
        description: t.string({ description: 'Optional localized category description for this locale.' }),
      }),
    },
    {
      description:
        'Creates or updates the localized translation of a category\'s name and description for the given locale.',
      errors: { types: [] },
      authScopes: async (_parent, args, ctx) =>
        scopeFor(await loadCategoryOrganizationId(ctx, Number(args.input.categoryId.id))),
      resolve: async (_root, args, ctx) => {
        const input = args.input
        await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* TranslationService
            yield* svc.upsertCategoryTranslation({
              categoryId: Number(input.categoryId.id),
              localeCode: input.localeCode,
              name: input.name,
              description: input.description ?? undefined,
            })
          }),
        )
        return { success: true }
      },
    },
    {
      outputFields: t => ({
        success: t.boolean({
          resolve: p => p.success,
          description: 'True when the translation operation completed successfully.',
        }),
      }),
    },
  )

  builder.relayMutationField(
    'removeCategoryTranslation',
    {
      inputFields: t => ({
        categoryId: t.globalID({
          for: 'Category',
          required: true,
          description: 'Global ID of the Category node whose translation is being removed.',
        }),
        localeCode: t.string({
          required: true,
          description: 'Registered locale code identifying which translation to delete.',
        }),
      }),
    },
    {
      description: 'Deletes the localized translation row of a category for the given locale.',
      errors: { types: [] },
      authScopes: async (_parent, args, ctx) =>
        scopeFor(await loadCategoryOrganizationId(ctx, Number(args.input.categoryId.id))),
      resolve: async (_root, args, ctx) => {
        const input = args.input
        await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* TranslationService
            yield* svc.removeCategoryTranslation({ categoryId: Number(input.categoryId.id), localeCode: input.localeCode })
          }),
        )
        return { success: true }
      },
    },
    {
      outputFields: t => ({
        success: t.boolean({
          resolve: p => p.success,
          description: 'True when the translation operation completed successfully.',
        }),
      }),
    },
  )

  // ── Collection translations (collections are org-only) ─────────────────────
  builder.relayMutationField(
    'upsertCollectionTranslation',
    {
      inputFields: t => ({
        collectionId: t.globalID({
          for: 'Collection',
          required: true,
          description: 'Global ID of the Collection node whose translation is being written.',
        }),
        localeCode: t.string({
          required: true,
          description: 'Registered locale code identifying which language this translation targets.',
        }),
        name: t.string({ required: true, description: 'Localized collection name for this locale.' }),
        description: t.string({ description: 'Optional localized collection description for this locale.' }),
      }),
    },
    {
      description:
        'Creates or updates the localized translation of a collection\'s name and description for the given locale.',
      errors: { types: [] },
      authScopes: async (_parent, args, ctx) =>
        scopeFor(await loadCollectionOrganizationId(ctx, Number(args.input.collectionId.id))),
      resolve: async (_root, args, ctx) => {
        const input = args.input
        await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* TranslationService
            yield* svc.upsertCollectionTranslation({
              collectionId: Number(input.collectionId.id),
              localeCode: input.localeCode,
              name: input.name,
              description: input.description ?? undefined,
            })
          }),
        )
        return { success: true }
      },
    },
    {
      outputFields: t => ({
        success: t.boolean({
          resolve: p => p.success,
          description: 'True when the translation operation completed successfully.',
        }),
      }),
    },
  )

  builder.relayMutationField(
    'removeCollectionTranslation',
    {
      inputFields: t => ({
        collectionId: t.globalID({
          for: 'Collection',
          required: true,
          description: 'Global ID of the Collection node whose translation is being removed.',
        }),
        localeCode: t.string({
          required: true,
          description: 'Registered locale code identifying which translation to delete.',
        }),
      }),
    },
    {
      description: 'Deletes the localized translation row of a collection for the given locale.',
      errors: { types: [] },
      authScopes: async (_parent, args, ctx) =>
        scopeFor(await loadCollectionOrganizationId(ctx, Number(args.input.collectionId.id))),
      resolve: async (_root, args, ctx) => {
        const input = args.input
        await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* TranslationService
            yield* svc.removeCollectionTranslation({ collectionId: Number(input.collectionId.id), localeCode: input.localeCode })
          }),
        )
        return { success: true }
      },
    },
    {
      outputFields: t => ({
        success: t.boolean({
          resolve: p => p.success,
          description: 'True when the translation operation completed successfully.',
        }),
      }),
    },
  )

  // ── Variant translations — scope from the variant's product org ────────────
  builder.relayMutationField(
    'upsertVariantTranslation',
    {
      inputFields: t => ({
        variantId: t.globalID({
          for: 'ProductVariant',
          required: true,
          description: 'Global ID of the ProductVariant node whose translation is being written.',
        }),
        localeCode: t.string({
          required: true,
          description: 'Registered locale code identifying which language this translation targets.',
        }),
        name: t.string({ required: true, description: 'Localized variant name for this locale.' }),
      }),
    },
    {
      description:
        'Creates or updates the localized translation of a product variant\'s name for the given locale.',
      errors: { types: [] },
      authScopes: async (_parent, args, ctx) =>
        scopeFor(await loadVariantOrganizationId(ctx, Number(args.input.variantId.id))),
      resolve: async (_root, args, ctx) => {
        const input = args.input
        await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* TranslationService
            yield* svc.upsertVariantTranslation({
              variantId: Number(input.variantId.id),
              localeCode: input.localeCode,
              name: input.name,
            })
          }),
        )
        return { success: true }
      },
    },
    {
      outputFields: t => ({
        success: t.boolean({
          resolve: p => p.success,
          description: 'True when the translation operation completed successfully.',
        }),
      }),
    },
  )

  builder.relayMutationField(
    'removeVariantTranslation',
    {
      inputFields: t => ({
        variantId: t.globalID({
          for: 'ProductVariant',
          required: true,
          description: 'Global ID of the ProductVariant node whose translation is being removed.',
        }),
        localeCode: t.string({
          required: true,
          description: 'Registered locale code identifying which translation to delete.',
        }),
      }),
    },
    {
      description: 'Deletes the localized translation row of a product variant for the given locale.',
      errors: { types: [] },
      authScopes: async (_parent, args, ctx) =>
        scopeFor(await loadVariantOrganizationId(ctx, Number(args.input.variantId.id))),
      resolve: async (_root, args, ctx) => {
        const input = args.input
        await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* TranslationService
            yield* svc.removeVariantTranslation({ variantId: Number(input.variantId.id), localeCode: input.localeCode })
          }),
        )
        return { success: true }
      },
    },
    {
      outputFields: t => ({
        success: t.boolean({
          resolve: p => p.success,
          description: 'True when the translation operation completed successfully.',
        }),
      }),
    },
  )
}
