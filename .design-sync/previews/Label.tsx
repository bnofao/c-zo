import { Input, Label } from '@workspace/ui'

export function Default() {
  return (
    <div className="flex w-72 flex-col gap-1.5">
      <Label htmlFor="name">Product name</Label>
      <Input id="name" placeholder="Aurora Headphones" />
    </div>
  )
}
