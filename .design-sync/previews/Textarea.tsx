import { Label, Textarea } from '@workspace/ui'

export function Default() {
  return (
    <div className="flex w-80 flex-col gap-1.5">
      <Label htmlFor="desc">Description</Label>
      <Textarea id="desc" placeholder="Describe the product…" defaultValue="Premium over-ear headphones with active noise cancellation." />
    </div>
  )
}
