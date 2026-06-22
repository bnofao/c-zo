import { Checkbox, Label } from '@workspace/ui'

export function Default() {
  return (
    <div className="flex flex-col gap-3">
      <Label className="flex items-center gap-2">
        <Checkbox defaultChecked />
        Published to marketplace
      </Label>
      <Label className="flex items-center gap-2">
        <Checkbox />
        Featured product
      </Label>
    </div>
  )
}
