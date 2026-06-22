import { Toggle } from '@workspace/ui'
import { Bold } from 'lucide-react'

export function Default() {
  return (
    <div className="flex items-center gap-2">
      <Toggle aria-label="Bold"><Bold /></Toggle>
      <Toggle defaultPressed>Featured</Toggle>
    </div>
  )
}
