import type { TranslationGraphQLSchemaBuilder } from '@czo/translation/graphql'
import { registerLocaleErrors } from './locale/errors'
import { registerLocaleMutations } from './locale/mutations'
import { registerLocaleQueries } from './locale/queries'
import { registerLocaleTypes } from './locale/types'

export type TranslationBuilder = TranslationGraphQLSchemaBuilder

export function registerTranslationSchema(builder: TranslationBuilder): void {
  registerLocaleTypes(builder)
  registerLocaleErrors(builder)
  registerLocaleQueries(builder)
  registerLocaleMutations(builder)
}
