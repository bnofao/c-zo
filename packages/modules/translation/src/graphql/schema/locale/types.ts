import type { TranslationGraphQLSchemaBuilder } from '@czo/translation/graphql'

export function registerLocaleTypes(builder: TranslationGraphQLSchemaBuilder): void {
  builder.drizzleNode('locales', {
    name: 'Locale',
    subGraphs: ['public'],
    description: 'A platform-wide locale in the global registry. Consumer modules key their translations by a locale `code`; one locale is the platform default.',
    id: { column: c => c.id },
    fields: t => ({
      code: t.exposeString('code', { description: 'BCP-47 locale code (e.g. `fr`, `en-US`), unique and lowercased.' }),
      name: t.exposeString('name', { description: 'Human-readable display name of the locale.' }),
      isActive: t.exposeBoolean('isActive', { description: 'Whether the locale is available for use (inactive locales are kept but not offered).' }),
      version: t.exposeInt('version', { description: 'Optimistic-lock version, incremented on each update.' }),
      createdAt: t.expose('createdAt', { type: 'DateTime', description: 'Timestamp when the locale was created.' }),
      updatedAt: t.expose('updatedAt', { type: 'DateTime', description: 'Timestamp when the locale was last updated.' }),
    }),
  })
}
