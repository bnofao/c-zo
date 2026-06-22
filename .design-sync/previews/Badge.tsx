import { Badge } from '@workspace/ui'

export function Variants() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge>Default</Badge>
      <Badge variant="secondary">Secondary</Badge>
      <Badge variant="destructive">Destructive</Badge>
      <Badge variant="outline">Outline</Badge>
    </div>
  )
}

export function Statuses() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge>Published</Badge>
      <Badge variant="secondary">Draft</Badge>
      <Badge variant="outline">Archived</Badge>
      <Badge variant="destructive">Suspended</Badge>
    </div>
  )
}
