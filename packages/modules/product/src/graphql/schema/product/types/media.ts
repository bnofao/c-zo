// ProductMedia node — scalar media row (base or org graft).

import type { ProductGraphQLSchemaBuilder } from '../../..'

export function registerMediaNode(builder: ProductGraphQLSchemaBuilder): void {
  builder.drizzleNode('productMedia', {
    name: 'ProductMedia',
    description:
      'A media asset (image or video) attached to a product. Exists either as a global BASE row (no organization) or as an organization-specific graft, and may be linked to particular variants.',
    // Load all columns so the `node(id:)` guard can read `organizationId`.
    select: true,
    id: { column: c => c.id },
    fields: t => ({
      url: t.exposeString('url', {
        description: 'The source URL of the media asset.',
      }),
      alt: t.exposeString('alt', {
        nullable: true,
        description: 'Alternative text describing the asset for accessibility.',
      }),
      type: t.exposeString('type', {
        description: 'Whether the asset is an image or a video.',
      }),
      position: t.exposeInt('position', {
        description: 'Sort order determining how this asset is sequenced among others.',
      }),
      organizationId: t.exposeInt('organizationId', {
        nullable: true,
        description: 'The owning organization for a graft; null for a global base asset.',
      }),
      version: t.exposeInt('version', {
        description: 'Optimistic-lock revision counter, incremented on each update.',
      }),
      createdAt: t.expose('createdAt', {
        type: 'DateTime',
        description: 'When the asset was created.',
      }),
      updatedAt: t.expose('updatedAt', {
        type: 'DateTime',
        description: 'When the asset was last modified.',
      }),
    }),
  })
}
