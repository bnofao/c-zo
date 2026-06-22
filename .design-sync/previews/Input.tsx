import { Input } from '@workspace/ui'

export function Default() {
  return (
    <div className="w-72">
      <Input placeholder="Search products…" />
    </div>
  )
}

export function WithValue() {
  return (
    <div className="w-72">
      <Input defaultValue="Acme Industries" />
    </div>
  )
}

export function Disabled() {
  return (
    <div className="w-72">
      <Input disabled placeholder="Unavailable" />
    </div>
  )
}

export function Labeled() {
  return (
    <label className="flex w-72 flex-col gap-1.5">
      <span className="text-sm font-medium text-foreground">Handle</span>
      <Input defaultValue="acme-industries" />
    </label>
  )
}
