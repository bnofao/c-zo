import type { SchemaBuilder } from '@czo/kit/graphql'

// ─── App Queries ──────────────────────────────────────────────────────────────

export function registerAppQueries(builder: SchemaBuilder): void {
  // ── app(id) — single app by DB ID ────────────────────────────────────────
  builder.queryField('app', t =>
    t.drizzleField({
      type: 'apps',
      nullable: true,
      args: {
        id: t.arg.id({ required: true }),
      },
      authScopes: { permission: { resource: 'apps', actions: ['read'] } },
      resolve: async (query, _root: unknown, args: Record<string, unknown>) => {
        const { useDatabase } = await import('@czo/kit/db')
        const db = await useDatabase() as any // db.query.* shape not available without full schema generic threading
        // Drizzle RQBv2: filter callback type (`TableFilter`) not publicly exported; cast required
        return db.query.apps.findFirst(query({ where: (a: any, { eq }: any) => eq(a.id, String(args.id)) } as any))
      },
    }))

  // ── apps(connection) — paginated list of installed apps ───────────────────
  builder.queryField('apps', t =>
    t.drizzleConnection({
      type: 'apps',
      args: {
        where: t.arg({ type: 'AppWhereInput', required: false }),
        orderBy: t.arg({ type: 'AppOrderByInput', required: false }),
      },
      authScopes: { permission: { resource: 'apps', actions: ['read'] } },
      resolve: async (query, _root: unknown, args: any) => { // Pothos drizzleConnection with AppWhereInput args: complex inferred type requires any here
        const { useDatabase } = await import('@czo/kit/db')
        const db = await useDatabase() as any // db.query.* shape not available without full schema generic threading
        const where = args.where as { status?: string | null } | null | undefined
        // Drizzle RQBv2: filter callback type (`TableFilter`) not publicly exported; cast required
        return db.query.apps.findMany(query({
          where: where?.status
            ? (a: any, { eq }: any) => eq(a.status, where.status)
            : undefined,
        } as any))
      },
      edgesField: {},
    }))

  // ── appBySlug(slug) — single app by appId/slug ────────────────────────────
  builder.queryField('appBySlug', t =>
    t.drizzleField({
      type: 'apps',
      nullable: true,
      args: {
        slug: t.arg.string({ required: true }),
      },
      authScopes: { permission: { resource: 'apps', actions: ['read'] } },
      resolve: async (query, _root: unknown, args: Record<string, unknown>) => {
        const { useDatabase } = await import('@czo/kit/db')
        const db = await useDatabase() as any // db.query.* shape not available without full schema generic threading
        // Drizzle RQBv2: filter callback type (`TableFilter`) not publicly exported; cast required
        return db.query.apps.findFirst(query({ where: (a: any, { eq }: any) => eq(a.appId, args.slug) } as any))
      },
    }))
}
