import { createServerFn } from '@tanstack/react-start'
import { graphql } from '../graphql/gen'
import { gqlAdmin } from '../graphql/gql-admin.server'

export interface ProductRow { id: string, name: string, handle: string }
export interface ProductPage { rows: ProductRow[], endCursor: string | null, hasNextPage: boolean }

interface Connection {
  edges: { node: ProductRow }[]
  pageInfo: { endCursor: string | null, hasNextPage: boolean }
}

export function toProductPage(c: Connection): ProductPage {
  return {
    rows: c.edges.map(e => e.node),
    endCursor: c.pageInfo.endCursor,
    hasNextPage: c.pageInfo.hasNextPage,
  }
}

const ProductsQuery = graphql(`
  query AdminProducts($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      edges { node { id name handle } }
      pageInfo { endCursor hasNextPage }
    }
  }
`)

export const fetchProducts = createServerFn({ method: 'GET' })
  .validator((data: { first?: number, after?: string | null }) => data)
  .handler(async ({ data }): Promise<ProductPage> => {
    const res = await gqlAdmin<{ products: Connection }>(ProductsQuery, {
      first: data.first ?? 20,
      after: data.after ?? null,
    })
    return toProductPage(res.products)
  })
