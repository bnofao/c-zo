/* This file was automatically generated. DO NOT UPDATE MANUALLY. */
    import type   { Resolvers } from './types.generated';
    import    { createStockLocation as Mutation_createStockLocation } from './../schema/stock-location/resolvers/Mutation/createStockLocation';
import    { CountryCodeResolver,DateTimeResolver,JSONObjectResolver,PhoneNumberResolver } from 'graphql-scalars';
    export const resolvers: Resolvers = {
      
      Mutation: { createStockLocation: Mutation_createStockLocation },
      
      CountryCode: CountryCodeResolver,
DateTime: DateTimeResolver,
JSONObject: JSONObjectResolver,
PhoneNumber: PhoneNumberResolver
    }