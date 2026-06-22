import { Label, RadioGroup, RadioGroupItem } from '@workspace/ui'

export function Default() {
  return (
    <RadioGroup defaultValue="all" className="flex flex-col gap-3">
      <Label className="flex items-center gap-2">
        <RadioGroupItem value="all" />
        All channels
      </Label>
      <Label className="flex items-center gap-2">
        <RadioGroupItem value="marketplace" />
        Marketplace only
      </Label>
      <Label className="flex items-center gap-2">
        <RadioGroupItem value="storefront" />
        Storefront only
      </Label>
    </RadioGroup>
  )
}
