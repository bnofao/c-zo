import type { LucideIcon } from 'lucide-react'
import type { ProductRow } from '../../server/products.server'
import { queryOptions, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useTranslate } from '@tolgee/react'
import { Badge } from '@workspace/ui/components/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/ui/components/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@workspace/ui/components/table'
import { FolderTree, Inbox, Layers, Package, SlidersHorizontal, Users } from 'lucide-react'
import { fetchProducts } from '../../server/products.server'

const recentProductsQuery = queryOptions({
  queryKey: ['products', 'recent'],
  queryFn: () => fetchProducts({ data: { first: 5 } }),
})

export const Route = createFileRoute('/_authed/')({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(recentProductsQuery)
  },
  component: DashboardPage,
})

interface Section {
  labelKey: string
  descKey: string
  icon: LucideIcon
  to?: '/products'
}

const sections: Section[] = [
  { labelKey: 'nav.products', descKey: 'dashboard.sections.products', icon: Package, to: '/products' },
  { labelKey: 'nav.categories', descKey: 'dashboard.sections.categories', icon: FolderTree },
  { labelKey: 'nav.collections', descKey: 'dashboard.sections.collections', icon: Layers },
  { labelKey: 'nav.attributes', descKey: 'dashboard.sections.attributes', icon: SlidersHorizontal },
  { labelKey: 'nav.users', descKey: 'dashboard.sections.users', icon: Users },
  { labelKey: 'nav.taxonomyRequests', descKey: 'dashboard.sections.taxonomyRequests', icon: Inbox },
]

function DashboardPage() {
  const { data } = useSuspenseQuery(recentProductsQuery)
  const { t } = useTranslate()
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t('dashboard.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('dashboard.subtitle')}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map(section => <SectionCard key={section.labelKey} section={section} t={t} />)}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('dashboard.recentProducts.title')}</CardTitle>
          <CardDescription>{t('dashboard.recentProducts.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          {data.rows.length === 0
            ? <p className="text-sm text-muted-foreground">{t('dashboard.recentProducts.empty')}</p>
            : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('common.col.name')}</TableHead>
                      <TableHead>{t('common.col.handle')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.rows.map((product: ProductRow) => (
                      <TableRow key={product.id}>
                        <TableCell>
                          <Link
                            to="/products/$productId"
                            params={{ productId: product.id }}
                            className="font-medium hover:underline"
                          >
                            {product.name}
                          </Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{product.handle}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
        </CardContent>
      </Card>
    </div>
  )
}

function SectionCard({ section, t }: { section: Section, t: (key: string) => string }) {
  const { labelKey, descKey, icon: Icon, to } = section
  const card = (
    <Card className={to ? 'transition-colors hover:bg-accent' : 'opacity-60'}>
      <CardHeader>
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <Icon className="size-4" />
          </span>
          <div className="flex flex-col gap-0.5">
            <CardTitle className="text-base">{t(labelKey)}</CardTitle>
            <CardDescription>{t(descKey)}</CardDescription>
          </div>
          {to ? null : <Badge variant="secondary" className="ml-auto">{t('dashboard.soon')}</Badge>}
        </div>
      </CardHeader>
    </Card>
  )
  return to ? <Link to={to}>{card}</Link> : card
}
