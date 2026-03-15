/* This file was automatically generated. DO NOT UPDATE MANUALLY. */
    import type   { Resolvers } from './types.generated';
    import    { createStockLocation as Mutation_createStockLocation } from './../schema/stock-location/resolvers/Mutation/createStockLocation';
import    { StockLocation } from './../schema/stock-location/resolvers/StockLocation';
import    { StockLocationAddress } from './../schema/stock-location/resolvers/StockLocationAddress';
import    { _empty as Query__empty } from '././../../../../../kit/src/graphql/resolvers/Query/_empty';
import    { _empty as Mutation__empty } from '././../../../../../kit/src/graphql/resolvers/Mutation/_empty';
import    { DateTimeResolver,EmailAddressResolver,JSONResolver } from 'graphql-scalars';
    export const resolvers: Resolvers = {
      Query: { _empty: Query__empty },
      Mutation: { createStockLocation: Mutation_createStockLocation,_empty: Mutation__empty },
      
      StockLocation: StockLocation,
StockLocationAddress: StockLocationAddress,
DateTime: DateTimeResolver,
EmailAddress: EmailAddressResolver,
JSON: JSONResolver
    }