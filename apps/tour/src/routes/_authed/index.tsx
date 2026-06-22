import type { LucideIcon } from 'lucide-react'
import type { ProductRow } from '../../server/products.server'
import { queryOptions, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
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
  label: string
  description: string
  icon: LucideIcon
  to?: '/products'
}

const sections: Section[] = [
  { label: 'Products', description: 'Global catalog products', icon: Package, to: '/products' },
  { label: 'Categories', description: 'Taxonomy categories', icon: FolderTree },
  { label: 'Collections', description: 'Curated collections', icon: Layers },
  { label: 'Attributes', description: 'Product attributes', icon: SlidersHorizontal },
  { label: 'Users', description: 'Platform accounts', icon: Users },
  { label: 'Taxonomy requests', description: 'Pending moderation', icon: Inbox },
]

function DashboardPage() {
  const { data } = useSuspenseQuery(recentProductsQuery)
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Platform administration for life.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map(section => <SectionCard key={section.label} section={section} />)}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent products</CardTitle>
          <CardDescription>The latest products in the global catalog.</CardDescription>
        </CardHeader>
        <CardContent>
          {data.rows.length === 0
            ? <p className="text-sm text-muted-foreground">No products yet.</p>
            : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Handle</TableHead>
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

function SectionCard({ section }: { section: Section }) {
  const { label, description, icon: Icon, to } = section
  const card = (
    <Card className={to ? 'transition-colors hover:bg-accent' : 'opacity-60'}>
      <CardHeader>
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <Icon className="size-4" />
          </span>
          <div className="flex flex-col gap-0.5">
            <CardTitle className="text-base">{label}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          {to ? null : <Badge variant="secondary" className="ml-auto">Soon</Badge>}
        </div>
      </CardHeader>
    </Card>
  )
  return to ? <Link to={to}>{card}</Link> : card
}
