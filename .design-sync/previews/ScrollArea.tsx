import { ScrollArea } from '@workspace/ui'

const tags = Array.from({ length: 18 }, (_, i) => `tag-${i + 1}`)

export function Default() {
  return (
    <ScrollArea className="h-44 w-56 rounded-lg border p-3">
      <div className="flex flex-col gap-2 text-sm">
        {tags.map(t => <div key={t} className="text-muted-foreground">{t}</div>)}
      </div>
    </ScrollArea>
  )
}
