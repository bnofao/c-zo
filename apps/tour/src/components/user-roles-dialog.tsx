import type { UserRow } from '../server/users.server'
import { useQueryClient } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import { useTranslate } from '@tolgee/react'
import { Button } from '@workspace/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'
import * as React from 'react'
import { errorCode } from '../graphql/admin-error'
import { csvRoles } from '../lib/role-delegation'
import { updateUserRoles } from '../server/users.server'
import { RolePicker } from './role-picker'
import { UserChip } from './user-chip'

const usersRouteApi = getRouteApi('/_authed/users')

export function UserRolesDialog({ user, onOpenChange }: {
  user: UserRow | null
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslate()
  const { me } = usersRouteApi.useRouteContext()
  const qc = useQueryClient()
  const [roles, setRoles] = React.useState<string[]>([])
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!user)
      return
    // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- reinitialize local state from the target user when the dialog's subject changes
    setRoles(csvRoles(user.role))
    // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- ditto
    setError(null)
  }, [user])

  const submit = async () => {
    if (!user)
      return
    setPending(true)
    setError(null)
    try {
      await updateUserRoles({ data: { id: user.id, roles } })
      await qc.invalidateQueries({ queryKey: ['users'] })
      onOpenChange(false)
    }
    catch (e) {
      const code = errorCode(e)
      setError(code ? t(`users.error.${code}`, t('users.error.generic')) : t('users.error.generic'))
    }
    finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={user != null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] grid-rows-[auto_minmax(0,1fr)_auto] gap-[18px] p-6 sm:max-w-[540px]">
        <div className="flex flex-col gap-[18px]">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold tracking-tight">{t('users.roles.title')}</DialogTitle>
            <DialogDescription>{t('users.roles.subtitle')}</DialogDescription>
          </DialogHeader>
          {user ? <UserChip user={user} /> : null}
        </div>
        <div className="-mx-2 flex min-h-0 flex-col gap-3 overflow-y-auto px-2">
          <RolePicker value={roles} onChange={setRoles} actorRoles={csvRoles(me.role)} isSelf={user?.id === me.id} />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter className="-mx-6 -mb-6 p-6">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>{t('common.cancel')}</Button>
          <Button onClick={submit} disabled={pending || roles.length === 0}>{t('common.save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
