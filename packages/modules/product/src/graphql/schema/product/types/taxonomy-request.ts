// TaxonomyRequest node.
//
// An org's pending request to create a new global taxonomy entity, or to
// promote one of its own org-tier entities to global. Exposed on the org and
// admin sub-graphs: the org sees its own outstanding requests, the platform
// reviews them. The `payload` jsonb holds the proposed name/slug for a
// creation; promotion requests carry `targetId` instead.

import type { ProductGraphQLSchemaBuilder } from '../../..'
import { productEnumRefs } from '../inputs'

export function registerTaxonomyRequestNode(builder: ProductGraphQLSchemaBuilder): void {
  builder.drizzleNode('taxonomyRequests', {
    name: 'TaxonomyRequest',
    subGraphs: ['org', 'admin'],
    description: 'An org\'s request to create or promote a global taxonomy entity, awaiting platform review.',
    select: true,
    id: { column: c => c.id },
    fields: (t) => {
      const enums = productEnumRefs()
      return {
        kind: t.expose('kind', { type: enums.TaxonomyRequestKind, description: 'Create a new global entity, or promote an existing org one.' }),
        entityType: t.expose('entityType', { type: enums.TaxonomyEntityType, description: 'The taxonomy entity concerned.' }),
        organizationId: t.exposeInt('organizationId', { description: 'The organization that submitted the request.' }),
        state: t.expose('state', { type: enums.TaxonomyRequestState, description: 'Pending, approved, or rejected.' }),
        reviewReason: t.exposeString('reviewReason', { nullable: true, description: 'Why the request was rejected; null otherwise.' }),
        reviewedAt: t.expose('reviewedAt', { type: 'DateTime', nullable: true, description: 'When an admin reviewed it, or null while pending.' }),
        targetId: t.exposeInt('targetId', { nullable: true, description: 'For a promotion: the org-tier entity id to promote.' }),
        resultId: t.exposeInt('resultId', { nullable: true, description: 'The resulting global entity id once approved.' }),
        proposedName: t.string({ nullable: true, resolve: r => (r.payload as { name?: string } | null)?.name ?? null, description: 'For a creation: the proposed name.' }),
        proposedSlug: t.string({ nullable: true, resolve: r => (r.payload as { slug?: string } | null)?.slug ?? null, description: 'For a creation: the proposed slug.' }),
      }
    },
  })
}
