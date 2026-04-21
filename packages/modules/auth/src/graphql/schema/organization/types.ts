// Organization sub-module — Pothos type definitions
//
// Relations available (relations.ts): none for organizations/members/invitations.
// These tables are better-auth managed and do not appear in authRelations.
// Member and Invitation are exposed as plain objectRefs (not drizzleNode) since
// they aren't referenced by globalID in the API. Organization uses drizzleNode
// for Relay node support since app-schema.graphql already treated it as a Node.

export function registerOrganizationTypes(builder: any): void {
  // ── Member type ───────────────────────────────────────────────────────────
  (builder as any).objectRef('Member').implement({
    fields: (t: any) => ({
      id: t.id({ resolve: (m: any) => m.id }),
      organizationId: t.string({ resolve: (m: any) => m.organizationId }),
      userId: t.string({ resolve: (m: any) => m.userId }),
      role: t.string({ resolve: (m: any) => m.role }),
      createdAt: t.field({ type: 'DateTime', resolve: (m: any) => m.createdAt }),
    }),
  });

  // ── Invitation type ───────────────────────────────────────────────────────
  (builder as any).objectRef('Invitation').implement({
    fields: (t: any) => ({
      id: t.id({ resolve: (i: any) => i.id }),
      organizationId: t.string({ resolve: (i: any) => i.organizationId }),
      email: t.string({ resolve: (i: any) => i.email }),
      role: t.string({ resolve: (i: any) => i.role }),
      status: t.string({ resolve: (i: any) => i.status }),
      inviterId: t.string({ resolve: (i: any) => i.inviterId }),
      expiresAt: t.field({ type: 'DateTime', resolve: (i: any) => i.expiresAt }),
      createdAt: t.field({ type: 'DateTime', resolve: (i: any) => i.createdAt }),
    }),
  });

  // ── Organization node ─────────────────────────────────────────────────────
  (builder as any).drizzleNode('organizations', {
    name: 'Organization',
    id: { column: (o: any) => o.id },
    fields: (t: any) => ({
      name: t.exposeString('name'),
      slug: t.exposeString('slug'),
      logo: t.exposeString('logo', { nullable: true }),
      type: t.exposeString('type', { nullable: true }),
      metadata: t.exposeString('metadata', { nullable: true }),
      createdAt: t.expose('createdAt', { type: 'DateTime' }),
      updatedAt: t.expose('updatedAt', { type: 'DateTime', nullable: true }),
    }),
  })
}
