import type { UserRow } from '../server/users.server'
import { Avatar, AvatarFallback } from '@workspace/ui/components/avatar'
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '@workspace/ui/components/item'

function initials(name: string, email: string): string {
  const base = name?.trim() || email
  return base.split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase()
}

/** Compact identity chip (avatar + name + email) shown in user-action dialogs. */
export function UserChip({ user }: { user: UserRow }) {
  return (
    <Item variant="muted" size="sm" className="bg-muted">
      <ItemMedia>
        <Avatar className="size-9 border">
          <AvatarFallback className="bg-background text-xs font-semibold">{initials(user.name, user.email)}</AvatarFallback>
        </Avatar>
      </ItemMedia>
      <ItemContent className="gap-0.5">
        <ItemTitle>{user.name}</ItemTitle>
        <ItemDescription className="truncate text-xs">{user.email}</ItemDescription>
      </ItemContent>
    </Item>
  )
}
