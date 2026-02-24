import {
  DateTimeResolver,
  DateTimeTypeDefinition,
  EmailAddressResolver,
  EmailAddressTypeDefinition,
  JSONDefinition,
  JSONResolver,
} from 'graphql-scalars'

export const scalarTypeDefs = [DateTimeTypeDefinition, EmailAddressTypeDefinition, JSONDefinition]

export const scalarResolvers = {
  DateTime: DateTimeResolver,
  EmailAddress: EmailAddressResolver,
  JSON: JSONResolver,
}
