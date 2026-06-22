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
  ownerScope,
} from '../authz'
import { sg } from '../subgraphs'

export function registerTranslationMutations(builder: ProductGraphQLSchemaBuilder): void {
  // ── Product translations ───────────────────────────────────────────────────
  builder.relayMutationField(
    'upsertProductTranslation',
    {
      ...sg('org', 'admin').input,
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
      ...sg('org', 'admin').field,
      description:
        'Creates or updates the localized translation of a product\'s name and description for the given locale.',
      errors: { types: [], ...sg('org', 'admin').errorOpts },
      authScopes: async (_parent, args, ctx) => ownerScope(await loadProductOrganizationId(ctx, Number(args.input.productId.id)), ['update']),
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
      ...sg('org', 'admin').payload,
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
      ...sg('org', 'admin').input,
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
      ...sg('org', 'admin').field,
      description: 'Deletes the localized translation row of a product for the given locale.',
      errors: { types: [], ...sg('org', 'admin').errorOpts },
      authScopes: async (_parent, args, ctx) => ownerScope(await loadProductOrganizationId(ctx, Number(args.input.productId.id)), ['update']),
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
      ...sg('org', 'admin').payload,
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
      ...sg('org', 'admin').input,
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
      ...sg('org', 'admin').field,
      description:
        'Creates or updates the localized translation of a category\'s name and description for the given locale.',
      errors: { types: [], ...sg('org', 'admin').errorOpts },
      authScopes: async (_parent, args, ctx) => ownerScope(await loadCategoryOrganizationId(ctx, Number(args.input.categoryId.id)), ['update']),
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
      ...sg('org', 'admin').payload,
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
      ...sg('org', 'admin').input,
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
      ...sg('org', 'admin').field,
      description: 'Deletes the localized translation row of a category for the given locale.',
      errors: { types: [], ...sg('org', 'admin').errorOpts },
      authScopes: async (_parent, args, ctx) => ownerScope(await loadCategoryOrganizationId(ctx, Number(args.input.categoryId.id)), ['update']),
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
      ...sg('org', 'admin').payload,
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
      ...sg('org').input,
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
      ...sg('org').field,
      description:
        'Creates or updates the localized translation of a collection\'s name and description for the given locale.',
      errors: { types: [], ...sg('org').errorOpts },
      authScopes: async (_parent, args, ctx) => ownerScope(await loadCollectionOrganizationId(ctx, Number(args.input.collectionId.id)), ['update']),
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
      ...sg('org').payload,
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
      ...sg('org').input,
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
      ...sg('org').field,
      description: 'Deletes the localized translation row of a collection for the given locale.',
      errors: { types: [], ...sg('org').errorOpts },
      authScopes: async (_parent, args, ctx) => ownerScope(await loadCollectionOrganizationId(ctx, Number(args.input.collectionId.id)), ['update']),
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
      ...sg('org').payload,
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
      ...sg('org', 'admin').input,
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
      ...sg('org', 'admin').field,
      description:
        'Creates or updates the localized translation of a product variant\'s name for the given locale.',
      errors: { types: [], ...sg('org', 'admin').errorOpts },
      authScopes: async (_parent, args, ctx) => ownerScope(await loadVariantOrganizationId(ctx, Number(args.input.variantId.id)), ['update']),
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
      ...sg('org', 'admin').payload,
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
      ...sg('org', 'admin').input,
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
      ...sg('org', 'admin').field,
      description: 'Deletes the localized translation row of a product variant for the given locale.',
      errors: { types: [], ...sg('org', 'admin').errorOpts },
      authScopes: async (_parent, args, ctx) => ownerScope(await loadVariantOrganizationId(ctx, Number(args.input.variantId.id)), ['update']),
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
      ...sg('org', 'admin').payload,
      outputFields: t => ({
        success: t.boolean({
          resolve: p => p.success,
          description: 'True when the translation operation completed successfully.',
        }),
      }),
    },
  )
}
