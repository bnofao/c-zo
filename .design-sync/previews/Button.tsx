import { Button } from '@workspace/ui'

export function Variants() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button>Primary</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="destructive">Delete</Button>
      <Button variant="link">Link</Button>
    </div>
  )
}

export function Sizes() {
  return (
    <div className="flex items-center gap-3">
      <Button size="sm">Small</Button>
      <Button>Default</Button>
      <Button size="lg">Large</Button>
    </div>
  )
}

export function Disabled() {
  return <Button disabled>Saving…</Button>
}

export function FullWidth() {
  return (
    <div className="w-72">
      <Button className="w-full">Create product</Button>
    </div>
  )
}
