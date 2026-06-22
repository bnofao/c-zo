import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@workspace/ui'
import { Search } from 'lucide-react'

export function Search_() {
  return (
    <InputGroup className="w-80">
      <InputGroupAddon>
        <Search />
      </InputGroupAddon>
      <InputGroupInput placeholder="Search products…" />
    </InputGroup>
  )
}

export function Prefixed() {
  return (
    <InputGroup className="w-80">
      <InputGroupAddon>
        <InputGroupText>czo.app/</InputGroupText>
      </InputGroupAddon>
      <InputGroupInput placeholder="handle" />
    </InputGroup>
  )
}
