import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '@workspace/ui'
import { Package } from 'lucide-react'

export function Default() {
  return (
    <Item variant="outline" className="w-96">
      <ItemMedia variant="icon">
        <Package />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>Aurora Headphones</ItemTitle>
        <ItemDescription>12 variants · Published</ItemDescription>
      </ItemContent>
    </Item>
  )
}
