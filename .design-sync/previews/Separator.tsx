import { Separator } from '@workspace/ui'

export function Horizontal() {
  return (
    <div className="w-72">
      <div className="text-sm font-medium text-foreground">Products</div>
      <Separator className="my-3" />
      <div className="text-sm text-muted-foreground">Manage the global catalog.</div>
    </div>
  )
}

export function Vertical() {
  return (
    <div className="flex h-6 items-center gap-3 text-sm">
      <span>Docs</span>
      <Separator orientation="vertical" />
      <span>API</span>
      <Separator orientation="vertical" />
      <span>Support</span>
    </div>
  )
}
