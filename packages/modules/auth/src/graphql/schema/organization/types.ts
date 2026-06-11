// Organization sub-module — Pothos type definitions
//
// Relations available (relations.ts): none for organizations/members/invitations.
// All three are exposed as drizzleNode (Relay nodes with global IDs).
// FK columns (organizationId, userId, inviterId) are exposed as `ID!` since
// they're identifiers; clients can resolve them to nodes via `node(id: ...)`
// once a global ID encoder is wired for these tables.

import type { AuthGraphQLSchemaBuilder } from '../../index'

export function registerOrganizationTypes(builder: AuthGraphQLSchemaBuilder): void {
  // ── Organization node ─────────────────────────────────────────────────────
  builder.drizzleNode('organizations', {
    name: 'Organization',
    subGraphs: ['account', 'org'],
    description: 'A tenant that groups members, invitations, and all org-scoped data under a unique slug.',
    id: { column: o => o.id },
    fields: t => ({
      name: t.exposeString('name', { description: 'The human-readable display name of the organization.' }),
      slug: t.exposeString('slug', { description: 'The unique URL-safe identifier used to reference the organization.' }),
      logo: t.exposeString('logo', { nullable: true, description: 'The URL of the organization\'s logo image, if one has been set.' }),
      type: t.exposeString('type', { nullable: true, description: 'An optional caller-defined classification of the organization.' }),
      metadata: t.exposeString('metadata', { nullable: true, description: 'Arbitrary JSON metadata associated with the organization, serialized as a string.' }),
      createdAt: t.expose('createdAt', { type: 'DateTime', description: 'The timestamp at which the organization was created.' }),
      updatedAt: t.expose('updatedAt', { type: 'DateTime', nullable: true, description: 'The timestamp at which the organization was last updated, if ever.' }),
    }),
  })

  // ── Member node ───────────────────────────────────────────────────────────
  builder.drizzleNode('members', {
    name: 'Member',
    subGraphs: ['account', 'org'],
    // `select: true` so the node-guard's `organizationId` is loaded regardless
    // of the client's field selection (see graphql/node-guards.ts).
    select: true,
    description: 'A membership linking a user to an organization with a role that defines their permissions within it.',
    id: { column: m => m.id },
    fields: t => ({
      organizationId: t.exposeID('organizationId', { description: 'The identifier of the organization this membership belongs to.' }),
      userId: t.exposeID('userId', { description: 'The identifier of the user who holds this membership.' }),
      role: t.exposeString('role', { description: 'The role granted to the member within the organization, determining their permissions.' }),
      createdAt: t.expose('createdAt', { type: 'DateTime', description: 'The timestamp at which the user joined the organization.' }),
    }),
  })

  // ── Invitation node ───────────────────────────────────────────────────────
  builder.drizzleNode('invitations', {
    name: 'Invitation',
    subGraphs: ['account', 'org'],
    // `select: true` so the node-guard's `organizationId` + `email` are loaded
    // regardless of the client's field selection (see graphql/node-guards.ts).
    select: true,
    description: 'An invitation for an email address to join an organization with a given role, tracked through its lifecycle.',
    id: { column: i => i.id },
    fields: t => ({
      organizationId: t.exposeID('organizationId', { description: 'The identifier of the organization the recipient is invited to join.' }),
      email: t.exposeString('email', { description: 'The email address the invitation was sent to.' }),
      role: t.exposeString('role', { nullable: true, description: 'The role the recipient will be granted upon accepting the invitation.' }),
      status: t.exposeString('status', { description: 'The current state of the invitation: pending, accepted, rejected, or expired.' }),
      inviterId: t.exposeID('inviterId', { description: 'The identifier of the user who issued the invitation.' }),
      expiresAt: t.expose('expiresAt', { type: 'DateTime', description: 'The timestamp after which the invitation can no longer be accepted.' }),
      createdAt: t.expose('createdAt', { type: 'DateTime', description: 'The timestamp at which the invitation was created.' }),
    }),
  })
}
