import { Avatar, AvatarFallback } from '@workspace/ui'

export function Initials() {
  return (
    <div className="flex items-center gap-3">
      <Avatar>
        <AvatarFallback>FA</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>CZ</AvatarFallback>
      </Avatar>
      <Avatar className="rounded-lg">
        <AvatarFallback className="rounded-lg">UI</AvatarFallback>
      </Avatar>
    </div>
  )
}

export function WithLabel() {
  return (
    <div className="flex items-center gap-3">
      <Avatar className="size-9">
        <AvatarFallback>FA</AvatarFallback>
      </Avatar>
      <div className="flex flex-col text-sm leading-tight">
        <span className="font-medium">Fawaz Ajani</span>
        <span className="text-muted-foreground">fawaz@czo.app</span>
      </div>
    </div>
  )
}
