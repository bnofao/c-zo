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
import { translatedField } from '@czo/translation/graphql'
import { graftAuthScopes, mergeWhere, viewerOrgId } from './merge'

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

      // ── Graft connections (merge predicate: base ∪ viewerOrg) ───────────────
      attributeValues: t.relatedConnection('attributeValues', {
        subGraphs: ['public', 'org', 'admin'],
        description: 'Attribute values assigned to this variant; merges base (org-null) rows with the viewer organization\'s overlay rows.',
        args: { viewerOrg: t.arg.globalID({ for: 'Organization', required: false, description: 'Optional viewer organization; overlays that org\'s grafts onto the base rows. Omit for base-only.' }) },
        authScopes: (_parent, args) => graftAuthScopes(args),
        query: args => ({ where: mergeWhere(viewerOrgId(args)), orderBy: { position: 'asc' } }),
      }, { subGraphs: ['public', 'org', 'admin'] }, { subGraphs: ['public', 'org', 'admin'] }),
      // variantInventoryItems carries a NOT NULL org → these are pure grafts;
      // only the viewer org's bindings are visible (no base/global rows exist).
      inventoryItems: t.relatedConnection('inventoryItems', {
        subGraphs: ['public', 'org', 'admin'],
        description: 'Inventory links for this variant scoped to the viewer organization; these are pure org grafts with no base rows, so omitting viewerOrg yields none.',
        args: { viewerOrg: t.arg.globalID({ for: 'Organization', required: false, description: 'Optional viewer organization; overlays that org\'s grafts onto the base rows. Omit for base-only.' }) },
        authScopes: (_parent, args) => graftAuthScopes(args),
        query: (args) => {
          const orgId = viewerOrgId(args)
          return { where: orgId == null ? { organizationId: -1 } : { organizationId: orgId } }
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
        args: { viewerOrg: t.arg.globalID({ for: 'Organization', required: false, description: 'Optional viewer organization; overlays that org\'s grafts onto the base rows. Omit for base-only.' }) },
        authScopes: (_parent, args) => graftAuthScopes(args),
        extensions: { pothosDrizzleSelect: { with: { priceSets: true } } },
        resolve: (variant, args) => {
          const orgId = viewerOrgId(args)
          if (orgId == null)
            return null
          const rows = (variant as unknown as { priceSets?: ReadonlyArray<{ id: number, priceSetId: number, organizationId: number }> }).priceSets ?? []
          return rows.find(r => r.organizationId === orgId) ?? null
        },
      }),
    }),
  })
}
