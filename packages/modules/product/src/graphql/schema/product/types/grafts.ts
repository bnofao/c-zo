// Graft / pivot row types.
//
// These tables back the `relatedConnection` graft fields on Product, Variant,
// Category, and Collection (attributeValues, channelListings, inventoryItems,
// category placements, collection memberships, variant↔media links). Each is a
// thin row exposing its own columns plus the cross-module ref ids (attributeId,
// valueId, channelId, inventoryItemId, …) as plain Ints — the client resolves
// those out-of-band against the owning module. They are registered as drizzle
// nodes (each table has its own `id`) so Pothos can materialise the connection
// edge type; access is always through the parent connection, which carries the
// org-merge predicate.

import type { ProductGraphQLSchemaBuilder } from '../../..'

export function registerGraftTypes(builder: ProductGraphQLSchemaBuilder): void {
  // ── ProductAttributeValue — a product's grafted attribute value ─────────────
  builder.drizzleNode('productAttributeValues', {
    name: 'ProductAttributeValue',
    subGraphs: ['public', 'org', 'admin'],
    description:
      'A graft row binding a product to one of its attribute values; null organizationId is the base assignment, a set organizationId is a specific org\'s overlay.',
    select: true,
    id: { column: c => c.id },
    fields: t => ({
      productId: t.exposeInt('productId', { description: 'The product this attribute value is assigned to.' }),
      organizationId: t.exposeInt('organizationId', {
        nullable: true,
        description: 'The owning organization of this graft, or null when it is the shared base assignment.',
      }),
      attributeId: t.exposeInt('attributeId', { description: 'The attribute (in the attribute module) this value belongs to.' }),
      valueId: t.exposeInt('valueId', { description: 'The specific attribute value assigned to the product.' }),
      position: t.exposeInt('position', { description: 'Ordering of this value among the product\'s attribute values.' }),
    }),
  })

  // ── VariantAttributeValue — a variant's grafted (selection) value ───────────
  builder.drizzleNode('variantAttributeValues', {
    name: 'VariantAttributeValue',
    subGraphs: ['public', 'org', 'admin'],
    description:
      'A graft row binding a variant to one of its selection attribute values; null organizationId is the base assignment, a set organizationId is a specific org\'s overlay.',
    select: true,
    id: { column: c => c.id },
    fields: t => ({
      variantId: t.exposeInt('variantId', { description: 'The variant this selection value is assigned to.' }),
      organizationId: t.exposeInt('organizationId', {
        nullable: true,
        description: 'The owning organization of this graft, or null when it is the shared base assignment.',
      }),
      attributeId: t.exposeInt('attributeId', { description: 'The attribute (in the attribute module) this value belongs to.' }),
      valueId: t.exposeInt('valueId', { description: 'The specific attribute value selected for the variant.' }),
      position: t.exposeInt('position', { description: 'Ordering of this value among the variant\'s attribute values.' }),
    }),
  })

  // ── ProductChannelListing — a product's publication on a channel ────────────
  builder.drizzleNode('productChannelListings', {
    name: 'ProductChannelListing',
    subGraphs: ['public', 'org', 'admin'],
    description: 'A graft row publishing a product onto a sales channel, carrying that channel-specific publication state.',
    select: true,
    id: { column: c => c.id },
    fields: t => ({
      productId: t.exposeInt('productId', { description: 'The product being listed on the channel.' }),
      channelId: t.exposeInt('channelId', { description: 'The sales channel (in the channel module) the product is listed on.' }),
      isPublished: t.exposeBoolean('isPublished', { description: 'Whether the product is published and live on this channel.' }),
      visibleInListings: t.exposeBoolean('visibleInListings', {
        description: 'Whether the product appears in browse and collection listings on this channel.',
      }),
      availableForPurchaseAt: t.expose('availableForPurchaseAt', {
        type: 'DateTime',
        nullable: true,
        description: 'The moment the product becomes purchasable on this channel, or null if not set.',
      }),
      publishedAt: t.expose('publishedAt', {
        type: 'DateTime',
        nullable: true,
        description: 'The moment the product was published on this channel, or null while unpublished.',
      }),
      version: t.exposeInt('version', { description: 'Optimistic-locking version of the listing row.' }),
    }),
  })

  // ── ProductCategory — a product↔category placement (graft) ──────────────────
  builder.drizzleNode('productCategories', {
    name: 'ProductCategory',
    subGraphs: ['public', 'org', 'admin'],
    description:
      'A graft row placing a product into a category; null organizationId is the base placement, a set organizationId is a specific org\'s overlay.',
    select: true,
    id: { column: c => c.id },
    fields: t => ({
      productId: t.exposeInt('productId', { description: 'The product placed in the category.' }),
      categoryId: t.exposeInt('categoryId', { description: 'The category the product is placed in.' }),
      organizationId: t.exposeInt('organizationId', {
        nullable: true,
        description: 'The owning organization of this placement, or null when it is the shared base placement.',
      }),
    }),
  })

  // ── CollectionProduct — a collection↔product membership (global link) ───────
  builder.drizzleNode('collectionProducts', {
    name: 'CollectionProduct',
    subGraphs: ['public', 'org', 'admin'],
    description: 'A link row recording that a product belongs to a collection.',
    select: true,
    id: { column: c => c.id },
    fields: t => ({
      collectionId: t.exposeInt('collectionId', { description: 'The collection the product is a member of.' }),
      productId: t.exposeInt('productId', { description: 'The product that is a member of the collection.' }),
    }),
  })

  // ── VariantInventoryItem — a variant's grafted inventory link ───────────────
  builder.drizzleNode('variantInventoryItems', {
    name: 'VariantInventoryItem',
    subGraphs: ['public', 'org', 'admin'],
    description: 'A graft row linking a variant to an inventory item it draws stock from, with the quantity each unit requires.',
    select: true,
    id: { column: c => c.id },
    fields: t => ({
      variantId: t.exposeInt('variantId', { description: 'The variant that consumes the inventory item.' }),
      organizationId: t.exposeInt('organizationId', { description: 'The owning organization of this inventory link.' }),
      inventoryItemId: t.exposeInt('inventoryItemId', { description: 'The inventory item (in the inventory module) the variant draws from.' }),
      requiredQuantity: t.exposeInt('requiredQuantity', { description: 'How many units of the inventory item one variant unit consumes.' }),
    }),
  })

  // ── VariantMedia — a variant↔media link (global link table) ─────────────────
  builder.drizzleNode('variantMedia', {
    name: 'VariantMedia',
    subGraphs: ['public', 'org', 'admin'],
    description: 'A link row associating a variant with a media asset.',
    select: true,
    id: { column: c => c.id },
    fields: t => ({
      variantId: t.exposeInt('variantId', { description: 'The variant the media asset is attached to.' }),
      mediaId: t.exposeInt('mediaId', { description: 'The media asset linked to the variant.' }),
    }),
  })
}
