import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@workspace/ui'
import { ChevronDown } from 'lucide-react'

export function Open() {
  return (
    <Collapsible defaultOpen className="w-64">
      <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm font-medium hover:bg-muted">
        Catalog
        <ChevronDown className="size-4 text-muted-foreground" />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1 flex flex-col gap-1 pl-2 text-sm text-muted-foreground">
        <span className="px-2 py-1">Products</span>
        <span className="px-2 py-1">Categories</span>
        <span className="px-2 py-1">Collections</span>
      </CollapsibleContent>
    </Collapsible>
  )
}
