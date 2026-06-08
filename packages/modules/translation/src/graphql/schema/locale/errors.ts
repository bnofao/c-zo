import type { TranslationGraphQLSchemaBuilder } from '@czo/translation/graphql'
import { registerError } from '@czo/kit/graphql'
import { LocaleCodeTaken, LocaleNotFound } from '../../../services/locale'

export { LocaleCodeTaken, LocaleNotFound }

export function registerLocaleErrors(builder: TranslationGraphQLSchemaBuilder): void {
  registerError(builder, LocaleNotFound, { name: 'LocaleNotFoundError' })
  registerError(builder, LocaleCodeTaken, { name: 'LocaleCodeTakenError', fields: t => ({ localeCode: t.exposeString('localeCode') }) })
}
