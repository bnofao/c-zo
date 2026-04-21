import { NotFoundError, UnauthenticatedError } from '@czo/kit/graphql'
import { useContainer } from '@czo/kit/ioc'

// ─── App Queries ──────────────────────────────────────────────────────────────

export function registerAppQueries(builder: any): void {
  // ── app(id) — single app by DB ID ────────────────────────────────────────
  builder.queryField('app', (t: any) =>
    t.drizzleField({
      type: 'apps',
      nullable: true,
      args: {
        id: t.arg.id({ required: true }),
      },
      authScopes: { permission: { resource: 'apps', actions: ['read'] } },
      resolve: async (query: any, _root: any, args: any) => {
        const { useDatabase } = await import('@czo/kit/db')
        const db = await useDatabase() as any
        return db.query.apps.findFirst(
          query({ where: (a: any, { eq }: any) => eq(a.id, String(args.id)) }),
        )
      },
    }),
  )

  // ── apps(connection) — paginated list of installed apps ───────────────────
  builder.queryField('apps', (t: any) =>
    t.drizzleConnection({
      type: 'apps',
      args: {
        where: t.arg({ type: 'AppWhereInput', required: false }),
        orderBy: t.arg({ type: 'AppOrderByInput', required: false }),
      },
      authScopes: { permission: { resource: 'apps', actions: ['read'] } },
      resolve: async (query: any, _root: any, args: any) => {
        const { useDatabase } = await import('@czo/kit/db')
        const db = await useDatabase() as any
        return db.query.apps.findMany(
          query({
            where: args.where?.status
              ? (a: any, { eq }: any) => eq(a.status, args.where.status)
              : undefined,
          }),
        )
      },
      edgesField: {},
    }),
  )

  // ── appBySlug(slug) — single app by appId/slug ────────────────────────────
  builder.queryField('appBySlug', (t: any) =>
    t.drizzleField({
      type: 'apps',
      nullable: true,
      args: {
        slug: t.arg.string({ required: true }),
      },
      authScopes: { permission: { resource: 'apps', actions: ['read'] } },
      resolve: async (query: any, _root: any, args: any) => {
        const { useDatabase } = await import('@czo/kit/db')
        const db = await useDatabase() as any
        return db.query.apps.findFirst(
          query({ where: (a: any, { eq }: any) => eq(a.appId, args.slug) }),
        )
      },
    }),
  )
}
