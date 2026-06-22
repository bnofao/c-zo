import { createServerFn } from '@tanstack/react-start'
import { graphql } from '../graphql/gen'
import { gqlAdmin } from '../graphql/gql-admin.server'

export interface ProductDetail { id: string, name: string, handle: string, createdAt: string }

export function pickProduct(data: { product: ProductDetail | null }): ProductDetail | null {
  return data.product
}

const ProductQuery = graphql(`
  query AdminProduct($id: ID!) {
    product(id: $id) { id name handle createdAt }
  }
`)

export const fetchProduct = createServerFn({ method: 'GET' })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }): Promise<ProductDetail | null> => {
    const res = await gqlAdmin<{ product: ProductDetail | null }>(ProductQuery, { id: data.id })
    return pickProduct(res)
  })
