import { queryOptions, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useTranslate } from '@tolgee/react'
import { Card } from '@workspace/ui/components/card'
import { fetchProduct } from '../../../server/product-detail.server'

function productQuery(id: string) {
  return queryOptions({ queryKey: ['product', id], queryFn: () => fetchProduct({ data: { id } }) })
}

export const Route = createFileRoute('/_authed/products/$productId')({
  loader: async ({ context, params }) => { await context.queryClient.ensureQueryData(productQuery(params.productId)) },
  component: ProductDetailPage,
})

function ProductDetailPage() {
  const { productId } = Route.useParams()
  const { t } = useTranslate()
  const { data } = useSuspenseQuery(productQuery(productId))
  if (!data)
    return <Card>{t('products.detail.notFound')}</Card>
  return (
    <Card>
      <h1 className="mb-2 text-lg font-semibold">{data.name}</h1>
      <dl className="grid grid-cols-[8rem_1fr] gap-1 text-sm">
        <dt className="text-muted-foreground">{t('common.col.handle')}</dt>
        <dd>{data.handle}</dd>
        <dt className="text-muted-foreground">{t('products.detail.created')}</dt>
        <dd>{data.createdAt}</dd>
      </dl>
    </Card>
  )
}
