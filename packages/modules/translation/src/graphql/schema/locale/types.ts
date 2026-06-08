import type { TranslationGraphQLSchemaBuilder } from '@czo/translation/graphql'

export function registerLocaleTypes(builder: TranslationGraphQLSchemaBuilder): void {
  builder.drizzleNode('locales', {
    name: 'Locale',
    id: { column: c => c.id },
    fields: t => ({
      code: t.exposeString('code'),
      name: t.exposeString('name'),
      isActive: t.exposeBoolean('isActive'),
      version: t.exposeInt('version'),
      createdAt: t.expose('createdAt', { type: 'DateTime' }),
      updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
    }),
  })
}
