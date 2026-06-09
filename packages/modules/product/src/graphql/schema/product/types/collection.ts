// Collection node — localized name/description, products.
//
// Relations (relations.ts):
//   collections.organization → one organizations
//   collections.products      → many collectionProducts
//   collections.translations  → many collectionTranslations (pivot)

import type { ProductGraphQLSchemaBuilder } from '../../..'
import { translatedField } from '@czo/translation/graphql'

export function registerCollectionNode(builder: ProductGraphQLSchemaBuilder): void {
  builder.drizzleNode('collections', {
    name: 'Collection',
    description:
      'A curated, organization-scoped grouping of products, related to its members many-to-many. Collections exist only at the organization tier; there is no global collection.',
    // Load all columns so the `node(id:)` guard can read `organizationId`.
    select: true,
    id: { column: c => c.id },
    fields: t => ({
      slug: t.exposeString('slug', {
        description: 'URL-friendly identifier, unique within the owning organization.',
      }),
      organizationId: t.exposeInt('organizationId', {
        description: 'Identifier of the organization that owns this collection.',
      }),
      version: t.exposeInt('version', {
        description: 'Optimistic-lock counter that increments on every update.',
      }),
      createdAt: t.expose('createdAt', {
        type: 'DateTime',
        description: 'Timestamp at which the collection was created.',
      }),
      updatedAt: t.expose('updatedAt', {
        type: 'DateTime',
        description: 'Timestamp at which the collection was last modified.',
      }),

      name: translatedField(t, {
        relation: 'translations',
        field: 'name',
        base: c => c.name,
        description:
          'Display name of the collection, returned in the requested locale when a translation exists, otherwise the base value.',
      }),
      description: translatedField(t, {
        relation: 'translations',
        field: 'description',
        base: c => c.description,
        nullable: true,
        description:
          'Free-form summary of the collection, returned in the requested locale when a translation exists, otherwise the base value.',
      }),

      organization: t.relation('organization', {
        description: 'The organization that owns this collection.',
      }),
      products: t.relatedConnection('products', {
        description: 'Products that belong to this collection, paginated as a Relay connection.',
      }),
    }),
  })
}
