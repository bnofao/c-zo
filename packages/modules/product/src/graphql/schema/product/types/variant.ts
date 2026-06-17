// ProductVariant node — localized name, overlay graft fields.
//
// Relations (relations.ts):
//   productVariants.product        → one products
//   productVariants.attributeValues → many variantAttributeValues  (graft)
//   productVariants.priceSets       → many variantPriceSets         (graft, NOT NULL org)
//   productVariants.inventoryItems  → many variantInventoryItems    (graft, NOT NULL org)
//   productVariants.media           → many variantMedia             (link table, no org)
//   productVariants.translations    → many variantTranslations      (pivot)

import type { ProductGraphQLSchemaBuilder } from '../../..'
import type { variantInventoryItems } from '../../../../database/schema'
import type { VavRow } from './assigned'
import type { GraftListing } from './merge'
import { resolveArrayConnection } from '@czo/kit/graphql'
import { translatedField } from '@czo/translation/graphql'
import { groupAssigned } from './assigned'
import { graftAuthScopes, resolveGraftOrg } from './merge'

// The typed value relations a grouped assignment needs loaded per attribute-value
// row. Shared by both `assignedAttributes` fields below.
const ASSIGNED_WITH = { attribute: true, selectValue: true, swatchValue: true, referenceValue: true, numericValue: true, booleanValue: true, dateValue: true, textValue: true, fileValue: true } as const

export function registerVariantNode(builder: ProductGraphQLSchemaBuilder): void {
  // ── VariantPriceSet — the variant's price binding for a viewer org ──────────
  // `priceSetId` is a cross-module ref to @czo/price (no FK); the client
  // resolves the PriceSet node out-of-band.
  const VariantPriceSetRef = builder
    .objectRef<{ id: number, priceSetId: number, organizationId: number }>('VariantPriceSet')
    .implement({
      subGraphs: ['public', 'org', 'admin'],
      description: 'The binding between a variant and a price set for a single viewer organization. The price set itself lives in @czo/price and is resolved out-of-band via priceSetId (no foreign key).',
      fields: t => ({
        id: t.exposeInt('id', { description: 'Unique identifier of this variant-to-price-set binding.' }),
        priceSetId: t.exposeInt('priceSetId', { description: 'Cross-module reference to the bound PriceSet in @czo/price; resolve the node separately.' }),
        organizationId: t.exposeInt('organizationId', { description: 'Identifier of the organization that owns this binding.' }),
      }),
    })

  builder.drizzleNode('productVariants', {
    name: 'ProductVariant',
    subGraphs: ['public', 'org', 'admin'],
    description: 'A purchasable variant of a product, identified by a unique option selection (attribute/value pairs) among its siblings. Carries org-overlay graft connections for attribute values, price sets, and inventory links.',
    // Load all columns so the `node(id:)` guard can read `organizationId`.
    select: true,
    id: { column: c => c.id },
    fields: t => ({
      sku: t.exposeString('sku', { nullable: true, description: 'Stock-keeping unit identifying this variant; null when unset.' }),
      position: t.exposeInt('position', { description: 'Sort order of this variant among its siblings.' }),
      organizationId: t.exposeInt('organizationId', { nullable: true, description: 'Owning organization, or null for a base (org-null) variant.' }),
      version: t.exposeInt('version', { description: 'Optimistic-lock version, incremented on each update.' }),
      createdAt: t.expose('createdAt', { type: 'DateTime', description: 'Timestamp when this variant was created.' }),
      updatedAt: t.expose('updatedAt', { type: 'DateTime', description: 'Timestamp when this variant was last updated.' }),

      name: translatedField(t, { relation: 'translations', field: 'name', base: () => null, nullable: true, description: 'Display name of the variant in the requested locale, or null when no translation exists.' }),

      product: t.relation('product', { description: 'The product this variant belongs to.' }),

      // ── Graft fields (custom in-memory; org from channel or viewerOrg) ──
      // Typed assigned attributes — groups the merged base∪org rows by attribute
      // and resolves each into the cross-module `AssignedAttribute` interface.
      assignedAttributes: t.field({
        type: ['AssignedAttribute'],
        subGraphs: ['public', 'org', 'admin'],
        description: 'The variant\'s attributes with typed values resolved inline. Pass `channel` for the storefront (the org that published the product there) or `viewerOrg` for a specific org; omit for base.',
        args: {
          channel: t.arg.int({ required: false, description: 'Storefront sales-channel id; resolves the publishing org. Public — publication is the gate.' }),
          viewerOrg: t.arg.globalID({ for: 'Organization', required: false, description: 'Optional viewer organization; overlays that org\'s grafts.' }),
        },
        authScopes: (_parent, args) => graftAuthScopes(args),
        extensions: { pothosDrizzleSelect: { with: { product: { with: { channelListings: true } }, attributeValues: { with: ASSIGNED_WITH } } } },
        resolve: (variant, args) => {
          const v = variant as unknown as { product?: { channelListings?: GraftListing[] }, attributeValues?: VavRow[] }
          return groupAssigned(v.attributeValues ?? [], resolveGraftOrg(args, v.product?.channelListings ?? []))
        },
      }),
      assignedAttribute: t.field({
        type: 'AssignedAttribute',
        nullable: true,
        subGraphs: ['public', 'org', 'admin'],
        description: 'A single assigned attribute by slug (PDP accessor). Same scoping as `assignedAttributes`.',
        args: {
          slug: t.arg.string({ required: true, description: 'The attribute slug to fetch.' }),
          channel: t.arg.int({ required: false }),
          viewerOrg: t.arg.globalID({ for: 'Organization', required: false }),
        },
        authScopes: (_parent, args) => graftAuthScopes(args),
        extensions: { pothosDrizzleSelect: { with: { product: { with: { channelListings: true } }, attributeValues: { with: ASSIGNED_WITH } } } },
        resolve: (variant, args) => {
          const v = variant as unknown as { product?: { channelListings?: GraftListing[] }, attributeValues?: VavRow[] }
          const org = resolveGraftOrg(args, v.product?.channelListings ?? [])
          return groupAssigned(v.attributeValues ?? [], org).find(g => g.attribute.slug === args.slug) ?? null
        },
      }),
      // variantInventoryItems carries a NOT NULL org → these are pure grafts;
      // only the viewer/publishing org's bindings are visible (no base/global rows exist).
      inventoryItems: t.connection({
        type: 'VariantInventoryItem',
        subGraphs: ['public', 'org', 'admin'],
        description: 'Inventory links for this variant scoped to the publishing/viewer organization; these are pure org grafts with no base rows, so resolving no org yields none. Pass `channel` for the storefront or `viewerOrg` for a specific org.',
        args: {
          viewerOrg: t.arg.globalID({ for: 'Organization', required: false, description: 'Optional viewer organization; overlays that org\'s grafts onto the base rows. Omit for base-only.' }),
          channel: t.arg.int({ required: false, description: 'Storefront sales-channel id; overlays the grafts of the org that published this product on the channel. Public — publication is the gate.' }),
        },
        authScopes: (_parent, args) => graftAuthScopes(args),
        extensions: { pothosDrizzleSelect: { with: { inventoryItems: true, product: { with: { channelListings: true } } } } },
        resolve: (variant, args) => {
          const v = variant as unknown as {
            inventoryItems?: ReadonlyArray<typeof variantInventoryItems.$inferSelect>
            product?: { channelListings?: ReadonlyArray<GraftListing> }
          }
          const org = resolveGraftOrg(args, v.product?.channelListings ?? [])
          const rows = org == null ? [] : (v.inventoryItems ?? []).filter(r => r.organizationId === org)
          return resolveArrayConnection({ args }, rows as Array<typeof variantInventoryItems.$inferSelect>)
        },
      }, { subGraphs: ['public', 'org', 'admin'] }, { subGraphs: ['public', 'org', 'admin'] }),
      // variantMedia is a global link table (no org) — not a graft.
      media: t.relatedConnection('media', { subGraphs: ['public', 'org', 'admin'], description: 'Media assets linked to this variant via the global link table; not org-scoped.' }, { subGraphs: ['public', 'org', 'admin'] }, { subGraphs: ['public', 'org', 'admin'] }),

      // The viewer org's price binding for this variant (unique per org), or
      // null when no viewer org or no binding exists.
      priceSet: t.field({
        subGraphs: ['public', 'org', 'admin'],
        description: 'The viewer organization\'s price-set binding for this variant (unique per org), or null when no viewer org is given or no binding exists.',
        type: VariantPriceSetRef,
        nullable: true,
        args: {
          viewerOrg: t.arg.globalID({ for: 'Organization', required: false, description: 'Optional viewer organization; overlays that org\'s grafts onto the base rows. Omit for base-only.' }),
          channel: t.arg.int({ required: false, description: 'Storefront sales-channel id; resolves the price binding of the org that published this product on the channel. Public — publication is the gate.' }),
        },
        authScopes: (_parent, args) => graftAuthScopes(args),
        extensions: { pothosDrizzleSelect: { with: { priceSets: true, product: { with: { channelListings: true } } } } },
        resolve: (variant, args) => {
          const v = variant as unknown as {
            priceSets?: ReadonlyArray<{ id: number, priceSetId: number, organizationId: number }>
            product?: { channelListings?: ReadonlyArray<{ channelId: number, organizationId: number | null, isPublished: boolean, reviewState: string, deletedAt: Date | null }> }
          }
          const orgId = resolveGraftOrg(args, v.product?.channelListings ?? [])
          if (orgId == null)
            return null
          return (v.priceSets ?? []).find(r => r.organizationId === orgId) ?? null
        },
      }),
    }),
  })
}
