import { ToggleGroup, ToggleGroupItem } from '@workspace/ui'
import { AlignCenter, AlignLeft, AlignRight } from 'lucide-react'

export function Default() {
  return (
    <ToggleGroup defaultValue={['left']}>
      <ToggleGroupItem value="left" aria-label="Left"><AlignLeft /></ToggleGroupItem>
      <ToggleGroupItem value="center" aria-label="Center"><AlignCenter /></ToggleGroupItem>
      <ToggleGroupItem value="right" aria-label="Right"><AlignRight /></ToggleGroupItem>
    </ToggleGroup>
  )
}
