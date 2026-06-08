import { DrizzleDb } from '@czo/kit/db'
import { translatedField } from '@czo/translation/graphql'
import { Effect } from 'effect'

export function registerWidgetTypes(builder: any): void {
  builder.drizzleNode('widgets', {
    name: 'Widget',
    id: { column: (c: any) => c.id },
    fields: (t: any) => ({
      name: translatedField(t, { relation: 'translations', field: 'name', base: (r: any) => r.name }),
      createdAt: t.expose('createdAt', { type: 'DateTime' }),
    }),
  })
  builder.queryField('widgets', (t: any) => t.drizzleConnection({
    type: 'widgets',
    resolve: (query: any, _root: any, _args: any, ctx: any) =>
      ctx.runEffect(Effect.gen(function* () {
        const db = yield* DrizzleDb
        return yield* (db.query as any).widgets.findMany(query({}))
      })),
  }))
}
