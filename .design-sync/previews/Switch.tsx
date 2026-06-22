import { Label, Switch } from '@workspace/ui'

export function Default() {
  return (
    <div className="flex flex-col gap-3">
      <Label className="flex items-center gap-2">
        <Switch defaultChecked />
        Marketplace enabled
      </Label>
      <Label className="flex items-center gap-2">
        <Switch />
        Require approval
      </Label>
    </div>
  )
}
