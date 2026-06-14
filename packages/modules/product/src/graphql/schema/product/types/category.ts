// Category node — localized name/description, self parent/children, products.
//
// Relations (relations.ts):
//   categories.organization → one organizations
//   categories.parent        → one categories  (nullable)
//   categories.children      → many categories
//   categories.products      → many productCategories
//   categories.translations  → many categoryTranslations (pivot)

import type { ProductGraphQLSchemaBuilder } from '../../..'
import { translatedField } from '@czo/translation/graphql'

export function registerCategoryNode(builder: ProductGraphQLSchemaBuilder): void {
  builder.drizzleNode('categories', {
    name: 'Category',
    subGraphs: ['org', 'admin'],
    description:
      'A node in the category tree. Categories are either global (organizationId null) or owned by a single organization, nest via a self parent/children relation, and group products through many-to-many placements.',
    // Load all columns so the `node(id:)` guard can read `organizationId`.
    select: true,
    id: { column: c => c.id },
    fields: t => ({
      slug: t.exposeString('slug', {
        description: 'URL-friendly identifier for the category, unique within its owning scope.',
      }),
      organizationId: t.exposeInt('organizationId', {
        nullable: true,
        description: 'The owning organization, or null when the category is global and shared across all organizations.',
      }),
      position: t.exposeInt('position', {
        description: 'Sort order of this category among its siblings under the same parent.',
      }),
      version: t.exposeInt('version', {
        description: 'Optimistic-locking version, incremented on each update to detect concurrent writes.',
      }),
      createdAt: t.expose('createdAt', {
        type: 'DateTime',
        description: 'Timestamp at which the category was created.',
      }),
      updatedAt: t.expose('updatedAt', {
        type: 'DateTime',
        description: 'Timestamp of the most recent update to the category.',
      }),

      name: translatedField(t, {
        relation: 'translations',
        field: 'name',
        base: c => c.name,
        description: 'Display name of the category, resolved for the requested locale and falling back to the base value.',
      }),
      description: translatedField(t, {
        relation: 'translations',
        field: 'description',
        base: c => c.description,
        nullable: true,
        description:
          'Optional descriptive text for the category, resolved for the requested locale and falling back to the base value.',
      }),

      organization: t.relation('organization', {
        nullable: true,
        description: 'The organization that owns this category, or null when the category is global.',
      }),
      parent: t.relation('parent', {
        nullable: true,
        description: 'The parent category in the tree, or null when this is a root category.',
      }),
      children: t.relatedConnection('children', {
        subGraphs: ['org', 'admin'],
        description: 'Direct child categories, excluding soft-deleted ones, ordered by their sibling position.',
        query: () => ({ where: { deletedAt: { isNull: true } }, orderBy: { position: 'asc' } }),
      }, { subGraphs: ['org', 'admin'] }, { subGraphs: ['org', 'admin'] }),
      products: t.relatedConnection('products', {
        subGraphs: ['org', 'admin'],
        description: 'Product placements that assign products to this category.',
      }, { subGraphs: ['org', 'admin'] }, { subGraphs: ['org', 'admin'] }),
    }),
  })
}
