import { Button, Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@workspace/ui'
import { PackageOpen } from 'lucide-react'

export function Default() {
  return (
    <Empty className="w-96 rounded-lg border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <PackageOpen />
        </EmptyMedia>
        <EmptyTitle>No products yet</EmptyTitle>
        <EmptyDescription>Create your first global catalog product to get started.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button size="sm">Create product</Button>
      </EmptyContent>
    </Empty>
  )
}
