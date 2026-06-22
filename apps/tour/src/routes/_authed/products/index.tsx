import type { ProductRow } from '../../../server/products.server'
import { queryOptions, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { fetchProducts } from '../../../server/products.server'

function productsQuery(after: string | null) {
  return queryOptions({
    queryKey: ['products', after],
    queryFn: () => fetchProducts({ data: { first: 20, after } }),
  })
}

export const Route = createFileRoute('/_authed/products/')({
  loader: async ({ context }) => { await context.queryClient.ensureQueryData(productsQuery(null)) },
  component: ProductsPage,
})

function ProductsPage() {
  const { data } = useSuspenseQuery(productsQuery(null))
  return (
    <div>
      <h1 className="mb-4 text-lg font-semibold">Products</h1>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="py-1">Name</th>
            <th>Handle</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((p: ProductRow) => (
            <tr key={p.id} className="border-t">
              <td className="py-1">
                <Link to="/products/$productId" params={{ productId: p.id }} className="hover:underline">{p.name}</Link>
              </td>
              <td>{p.handle}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.hasNextPage
        ? <p className="mt-3 text-xs text-muted-foreground">More available (pagination wired in a follow-up).</p>
        : null}
    </div>
  )
}
