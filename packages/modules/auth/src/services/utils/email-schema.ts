import { Schema, SchemaGetter } from 'effect'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/

const email = Schema.String.check(
  Schema.isPattern(EMAIL_PATTERN, { message: 'Invalid email address' }),
).pipe(
  Schema.decode({
    decode: SchemaGetter.transform((s: string) => s.toLowerCase()),
    encode: SchemaGetter.transform((s: string) => s),
  }),
)

export const emailSchema = Schema.toStandardSchemaV1(email)
