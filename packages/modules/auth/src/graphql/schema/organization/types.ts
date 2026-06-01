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
    id: { column: o => o.id },
    fields: t => ({
      name: t.exposeString('name'),
      slug: t.exposeString('slug'),
      logo: t.exposeString('logo', { nullable: true }),
      type: t.exposeString('type', { nullable: true }),
      metadata: t.exposeString('metadata', { nullable: true }),
      createdAt: t.expose('createdAt', { type: 'DateTime' }),
      updatedAt: t.expose('updatedAt', { type: 'DateTime', nullable: true }),
    }),
  })

  // ── Member node ───────────────────────────────────────────────────────────
  builder.drizzleNode('members', {
    name: 'Member',
    id: { column: m => m.id },
    fields: t => ({
      organizationId: t.exposeID('organizationId'),
      userId: t.exposeID('userId'),
      role: t.exposeString('role'),
      createdAt: t.expose('createdAt', { type: 'DateTime' }),
    }),
  })

  // ── Invitation node ───────────────────────────────────────────────────────
  builder.drizzleNode('invitations', {
    name: 'Invitation',
    id: { column: i => i.id },
    fields: t => ({
      organizationId: t.exposeID('organizationId'),
      email: t.exposeString('email'),
      role: t.exposeString('role', { nullable: true }),
      status: t.exposeString('status'),
      inviterId: t.exposeID('inviterId'),
      expiresAt: t.expose('expiresAt', { type: 'DateTime' }),
      createdAt: t.expose('createdAt', { type: 'DateTime' }),
    }),
  })
}
