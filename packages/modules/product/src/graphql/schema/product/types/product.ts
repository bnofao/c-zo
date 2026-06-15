// Product node — localized name/description, overlay graft connections, and the
// per-viewer `isAdopted` flag.
//
// Relations (relations.ts):
//   products.organization    → one organizations
//   products.productType      → one productTypes
//   products.variants         → many productVariants
//   products.attributeValues  → many productAttributeValues  (graft)
//   products.categories       → many productCategories       (graft)
//   products.collections      → many collectionProducts
//   products.channelListings  → many productChannelListings   (graft)
//   products.media            → many productMedia             (graft)
//   products.translations     → many productTranslations      (pivot)

import type { ProductGraphQLSchemaBuilder } from '../../..'
import { translatedField } from '@czo/translation/graphql'
import { Effect } from 'effect'
import { AdoptionService } from '../../../../services'
import { graftAuthScopes, mergeWhere, viewerOrgId } from './merge'

export function registerProductNode(builder: ProductGraphQLSchemaBuilder): void {
  builder.drizzleNode('products', {
    name: 'Product',
    subGraphs: ['public', 'org', 'admin'],
    description:
      'A sellable product. Either global (platform-managed, organizationId null) or org-owned. An org adopts a global product, then grafts org-scoped overlays (attribute values, media, categories, channel listings, variants) onto the base; graft reads merge the base rows with the viewer org\'s rows.',
    // Load all columns so the `node(id:)` guard can read `organizationId`.
    select: true,
    id: { column: c => c.id },
    fields: t => ({
      handle: t.exposeString('handle', {
        description: 'URL-friendly slug uniquely identifying the product within its scope.',
      }),
      organizationId: t.exposeInt('organizationId', {
        nullable: true,
        description: 'Owning organization; null for global, platform-managed products.',
      }),
      thumbnailUrl: t.exposeString('thumbnailUrl', {
        nullable: true,
        description: 'URL of the product\'s thumbnail image, if set.',
      }),
      version: t.exposeInt('version', {
        description: 'Optimistic-lock version, incremented on every update.',
      }),
      createdAt: t.expose('createdAt', {
        type: 'DateTime',
        description: 'Timestamp when the product was created.',
      }),
      updatedAt: t.expose('updatedAt', {
        type: 'DateTime',
        description: 'Timestamp when the product was last updated.',
      }),

      // Localized — overlay the requested locale's translation onto the base
      // column. Loads the `translations` pivot via the pothosDrizzleSelect
      // extension (batched across the parent list).
      name: translatedField(t, {
        relation: 'translations',
        field: 'name',
        base: p => p.name,
        description: 'Display name, overlaid with the requested locale\'s translation when available, falling back to the base value.',
      }),
      description: translatedField(t, {
        relation: 'translations',
        field: 'description',
        base: p => p.description,
        nullable: true,
        description: 'Long-form description, overlaid with the requested locale\'s translation when available, falling back to the base value.',
      }),

      organization: t.relation('organization', {
        nullable: true,
        subGraphs: ['org', 'admin'],
        description: 'Owning organization; null for global products.',
      }),
      productType: t.relation('productType', {
        description: 'The product type this product belongs to.',
      }),

      // ── Graft connections (merge predicate: base ∪ viewerOrg) ───────────────
      variants: t.relatedConnection('variants', {
        subGraphs: ['public', 'org', 'admin'],
        description: 'Purchasable variants of this product. Merges base variants with the viewer org\'s grafted variants; excludes soft-deleted rows.',
        args: { viewerOrg: t.arg.globalID({ for: 'Organization', required: false, description: 'Optional viewer organization; overlays that org\'s grafts onto the base rows. Omit for base-only.' }) },
        authScopes: (_parent, args) => graftAuthScopes(args),
        query: args => ({ where: { deletedAt: { isNull: true }, ...mergeWhere(viewerOrgId(args)) } }),
      }, { subGraphs: ['public', 'org', 'admin'] }, { subGraphs: ['public', 'org', 'admin'] }),
      attributeValues: t.relatedConnection('attributeValues', {
        subGraphs: ['public', 'org', 'admin'],
        description: 'Attribute values describing this product, ordered by position. Merges base values with the viewer org\'s grafted values.',
        args: { viewerOrg: t.arg.globalID({ for: 'Organization', required: false, description: 'Optional viewer organization; overlays that org\'s grafts onto the base rows. Omit for base-only.' }) },
        authScopes: (_parent, args) => graftAuthScopes(args),
        query: args => ({ where: mergeWhere(viewerOrgId(args)), orderBy: { position: 'asc' } }),
      }, { subGraphs: ['public', 'org', 'admin'] }, { subGraphs: ['public', 'org', 'admin'] }),
      media: t.relatedConnection('media', {
        subGraphs: ['public', 'org', 'admin'],
        description: 'Media assets for this product, ordered by position. Merges base media with the viewer org\'s grafted media; excludes soft-deleted rows.',
        args: { viewerOrg: t.arg.globalID({ for: 'Organization', required: false, description: 'Optional viewer organization; overlays that org\'s grafts onto the base rows. Omit for base-only.' }) },
        authScopes: (_parent, args) => graftAuthScopes(args),
        query: args => ({ where: { deletedAt: { isNull: true }, ...mergeWhere(viewerOrgId(args)) }, orderBy: { position: 'asc' } }),
      }, { subGraphs: ['public', 'org', 'admin'] }, { subGraphs: ['public', 'org', 'admin'] }),
      categories: t.relatedConnection('categories', {
        subGraphs: ['public', 'org', 'admin'],
        description: 'Categories this product is assigned to. Merges base assignments with the viewer org\'s grafted assignments.',
        args: { viewerOrg: t.arg.globalID({ for: 'Organization', required: false, description: 'Optional viewer organization; overlays that org\'s grafts onto the base rows. Omit for base-only.' }) },
        authScopes: (_parent, args) => graftAuthScopes(args),
        query: args => ({ where: mergeWhere(viewerOrgId(args)) }),
      }, { subGraphs: ['public', 'org', 'admin'] }, { subGraphs: ['public', 'org', 'admin'] }),
      // collectionProducts has no organizationId column (a global link table);
      // it is not a graft, so no merge predicate applies.
      collections: t.relatedConnection('collections', {
        subGraphs: ['public', 'org', 'admin'],
        description: 'Collections that include this product. A global link table, not an org graft, so no viewer-org overlay applies.',
      }, { subGraphs: ['public', 'org', 'admin'] }, { subGraphs: ['public', 'org', 'admin'] }),
      // channelListings is org-scoped through its `channelId` (→ channels.org),
      // out-of-module; the row itself carries no organizationId, so the
      // organizationId merge predicate does not apply — only soft-delete.
      channelListings: t.relatedConnection('channelListings', {
        subGraphs: ['public', 'org', 'admin'],
        description: 'Sales-channel listings for this product, scoped via their channel. Excludes soft-deleted rows; no viewer-org overlay applies.',
        query: () => ({ where: { deletedAt: { isNull: true } } }),
      }, { subGraphs: ['public', 'org', 'admin'] }, { subGraphs: ['public', 'org', 'admin'] }),

      // Whether `viewerOrg` has adopted this (global) product. False with no
      // viewer org, and false for org-owned products (nothing to adopt).
      isAdopted: t.boolean({
        description: 'Whether the given viewer organization has adopted this global product. False when no viewer org is given, and false for org-owned products.',
        args: { viewerOrg: t.arg.globalID({ for: 'Organization', required: false, description: 'Optional viewer organization; overlays that org\'s grafts onto the base rows. Omit for base-only.' }) },
        authScopes: (_parent, args) => graftAuthScopes(args),
        resolve: (product, args, ctx) => {
          const orgId = viewerOrgId(args)
          if (orgId == null)
            return false
          return ctx.runEffect(
            Effect.gen(function* () {
              return yield* (yield* AdoptionService).isAdopted({ productId: product.id, orgId })
            }),
          )
        },
      }),
    }),
  })
}
