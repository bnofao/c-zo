/* This file was automatically generated. DO NOT UPDATE MANUALLY. */
    import type   { Resolvers } from './types.generated';
    import    { products as Query_products } from './product/resolvers/Query/products';
import    { Product } from './product/resolvers/Product';
    export const resolvers: Resolvers = {
      Query: { products: Query_products },
      
      
      Product: Product
    }