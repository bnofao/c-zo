import type { SchemaBuilder } from '@czo/kit/graphql'
import type { Relations } from '@czo/translation/relations'
import type { Locale } from '../services/locale'
import '@czo/auth/graphql'

export { registerTranslationSchema, type TranslationBuilder } from './schema'
export { pickTranslation, translatedField } from './translated-field'

export type TranslationGraphQLSchemaBuilder = SchemaBuilder<Relations>

declare module '@czo/kit/graphql' {
  interface BuilderSchemaObjects {
    Locale: Locale
  }
}
