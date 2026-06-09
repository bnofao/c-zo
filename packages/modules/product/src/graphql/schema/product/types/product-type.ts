// ProductType node + its attribute declarations.
//
// Relations (relations.ts):
//   productTypes.organization → one organizations
//   productTypes.attributes    → many productTypeAttributes
//   productTypeAttributes.productType → one productTypes

import type { ProductGraphQLSchemaBuilder } from '../../..'

export function registerProductTypeNode(builder: ProductGraphQLSchemaBuilder): void {
  // ── ProductTypeAttribute node ──────────────────────────────────────────────
  // A declaration row; `attributeId` is a cross-module ref to @czo/attribute
  // (no FK), exposed as a plain Int for the client to resolve out-of-band.
  builder.drizzleNode('productTypeAttributes', {
    name: 'ProductTypeAttribute',
    description:
      'Declares that an attribute applies to a product type, either to its products or its variants. Base declarations belong to the type itself; org extensions graft additional declarations onto a (typically global) type.',
    select: true,
    id: { column: c => c.id },
    fields: t => ({
      attributeId: t.exposeInt('attributeId', {
        description:
          'Cross-module reference to the @czo/attribute attribute being declared; resolved out-of-band by the client.',
      }),
      assignment: t.exposeString('assignment', {
        description:
          'Whether this attribute applies at the PRODUCT or VARIANT level.',
      }),
      variantSelection: t.exposeBoolean('variantSelection', {
        description:
          'When true, this attribute participates in the variant selection matrix used to generate variants.',
      }),
      position: t.exposeInt('position', {
        description: 'Ordering of this declaration within its product type.',
      }),
      organizationId: t.exposeInt('organizationId', {
        nullable: true,
        description:
          'Owning organization for an org graft, or null for a base declaration that ships with the type.',
      }),
    }),
  })

  // ── ProductType node ───────────────────────────────────────────────────────
  builder.drizzleNode('productTypes', {
    name: 'ProductType',
    description:
      'A central pivot that declares which attributes apply to its products and variants. A type is global (organizationId null) or org-owned, and an org can extend a global type with its own attribute declarations.',
    // Load all columns so the `node(id:)` guard can read `organizationId`.
    select: true,
    id: { column: c => c.id },
    fields: t => ({
      name: t.exposeString('name', {
        description: 'Human-readable name of the product type.',
      }),
      slug: t.exposeString('slug', {
        description: 'URL-friendly identifier for the product type.',
      }),
      isShippingRequired: t.exposeBoolean('isShippingRequired', {
        description:
          'Marks the type as physical goods that require shipping.',
      }),
      organizationId: t.exposeInt('organizationId', {
        nullable: true,
        description:
          'Owning organization, or null when the type is global.',
      }),
      version: t.exposeInt('version', {
        description: 'Optimistic-lock version, incremented on each update.',
      }),
      createdAt: t.expose('createdAt', {
        type: 'DateTime',
        description: 'When the product type was created.',
      }),
      updatedAt: t.expose('updatedAt', {
        type: 'DateTime',
        description: 'When the product type was last updated.',
      }),

      organization: t.relation('organization', {
        nullable: true,
        description:
          'Owning organization, or null when the type is global.',
      }),

      // A type's attribute declarations. Base declarations (`organizationId IS
      // NULL`) plus org extensions; left unfiltered here so a type fully exposes
      // its declaration set (consumers scope grafts on the value side).
      attributes: t.relatedConnection('attributes', {
        description:
          'Attribute declarations for this type, ordered by position, covering both base declarations and org grafts.',
        query: () => ({ orderBy: { position: 'asc' } }),
      }),
    }),
  })
}
