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
import type { productCategories, productMedia } from '../../../../database/schema'
import type { GraftListing } from './merge'
import { assignedAttributeField, assignedAttributesField } from '@czo/attribute/graphql'
import { resolveArrayConnection } from '@czo/kit/graphql'
import { translatedField } from '@czo/translation/graphql'
import { Effect } from 'effect'
import { ProductService } from '../../../../services'
import { graftAuthScopes, resolveGraftOrg, viewerOrgId } from './merge'

// The typed value relations a grouped assignment needs loaded per attribute-value
// row. Shared by both `assignedAttributes` fields below.
const ASSIGNED_WITH = { attribute: true, selectValue: true, swatchValue: true, referenceValue: true, numericValue: true, booleanValue: true, dateValue: true, textValue: true, fileValue: true } as const

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
        description: 'Purchasable variants of this product (scoped via the product relation; excludes soft-deleted rows).',
        query: { where: { deletedAt: { isNull: true } } },
      }, { subGraphs: ['public', 'org', 'admin'] }, { subGraphs: ['public', 'org', 'admin'] }),
      // Typed assigned attributes — base∪org rows grouped into the cross-module
      // `AssignedAttribute` interface (helper owned by @czo/attribute). Product
      // injects only the graft wiring: how rows load, and which org overlays.
      assignedAttributes: assignedAttributesField(t, {
        with: { channelListings: true, attributeValues: { with: ASSIGNED_WITH } },
        subGraphs: ['public', 'org', 'admin'],
        description: 'The product\'s attributes with typed values resolved inline. Pass `channel` for the storefront (the org that published the product there) or `viewerOrg` for a specific org; omit for base.',
        args: {
          channel: t.arg.int({ required: false, description: 'Storefront sales-channel id; resolves the publishing org. Public — publication is the gate.' }),
          viewerOrg: t.arg.globalID({ for: 'Organization', required: false, description: 'Optional viewer organization; overlays that org\'s grafts.' }),
        },
        authScopes: (_parent, args) => graftAuthScopes(args),
        rows: p => p.attributeValues ?? [],
        org: (p, args) => resolveGraftOrg(args, p.channelListings ?? []),
      }),
      assignedAttribute: assignedAttributeField(t, {
        with: { channelListings: true, attributeValues: { with: ASSIGNED_WITH } },
        subGraphs: ['public', 'org', 'admin'],
        description: 'A single assigned attribute by slug (PDP accessor). Same scoping as `assignedAttributes`.',
        args: {
          channel: t.arg.int({ required: false }),
          viewerOrg: t.arg.globalID({ for: 'Organization', required: false }),
        },
        authScopes: (_parent, args) => graftAuthScopes(args),
        rows: p => p.attributeValues ?? [],
        org: (p, args) => resolveGraftOrg(args, p.channelListings ?? []),
      }),
      media: t.connection({
        type: 'ProductMedia',
        subGraphs: ['public', 'org', 'admin'],
        description: 'Media assets for this product, ordered by position. Merges base media with the publishing/viewer organization\'s grafted media; excludes soft-deleted rows. Pass `channel` for the storefront or `viewerOrg` for a specific org.',
        args: {
          viewerOrg: t.arg.globalID({ for: 'Organization', required: false, description: 'Optional viewer organization; overlays that org\'s grafts onto the base rows. Omit for base-only.' }),
          channel: t.arg.int({ required: false, description: 'Storefront sales-channel id; overlays the grafts of the org that published this product on the channel. Public — publication is the gate.' }),
        },
        authScopes: (_parent, args) => graftAuthScopes(args),
        extensions: { pothosDrizzleSelect: { with: { media: true, channelListings: true } } },
        resolve: (product, args) => {
          const p = product as unknown as {
            media?: ReadonlyArray<typeof productMedia.$inferSelect>
            channelListings?: ReadonlyArray<GraftListing>
          }
          const org = resolveGraftOrg(args, p.channelListings ?? [])
          const rows = (p.media ?? [])
            .filter(r => r.deletedAt == null && (r.organizationId == null || r.organizationId === org))
            .sort((a, b) => a.position - b.position)
          return resolveArrayConnection({ args }, rows as Array<typeof productMedia.$inferSelect>)
        },
      }, { subGraphs: ['public', 'org', 'admin'] }, { subGraphs: ['public', 'org', 'admin'] }),
      categories: t.connection({
        type: 'ProductCategory',
        subGraphs: ['public', 'org', 'admin'],
        description: 'Categories this product is assigned to. Merges base assignments with the publishing/viewer organization\'s grafted assignments. Pass `channel` for the storefront or `viewerOrg` for a specific org.',
        args: {
          viewerOrg: t.arg.globalID({ for: 'Organization', required: false, description: 'Optional viewer organization; overlays that org\'s grafts onto the base rows. Omit for base-only.' }),
          channel: t.arg.int({ required: false, description: 'Storefront sales-channel id; overlays the grafts of the org that published this product on the channel. Public — publication is the gate.' }),
        },
        authScopes: (_parent, args) => graftAuthScopes(args),
        extensions: { pothosDrizzleSelect: { with: { categories: true, channelListings: true } } },
        resolve: (product, args) => {
          const p = product as unknown as {
            categories?: ReadonlyArray<typeof productCategories.$inferSelect>
            channelListings?: ReadonlyArray<GraftListing>
          }
          const org = resolveGraftOrg(args, p.channelListings ?? [])
          const rows = (p.categories ?? [])
            .filter(r => r.organizationId == null || r.organizationId === org)
          return resolveArrayConnection({ args }, rows as Array<typeof productCategories.$inferSelect>)
        },
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
              return yield* (yield* ProductService).isAdopted({ productId: product.id, orgId })
            }),
          )
        },
      }),
    }),
  })
}
