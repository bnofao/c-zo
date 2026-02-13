import {
  DateTimeResolver,
  DateTimeTypeDefinition,
  EmailAddressResolver,
  EmailAddressTypeDefinition,
} from 'graphql-scalars'

export const scalarTypeDefs = [DateTimeTypeDefinition, EmailAddressTypeDefinition]

export const scalarResolvers = {
  DateTime: DateTimeResolver,
  EmailAddress: EmailAddressResolver,
}
