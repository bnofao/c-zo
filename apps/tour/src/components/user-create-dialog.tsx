import { useQueryClient } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import { useTranslate } from '@tolgee/react'
import { Button } from '@workspace/ui/components/button'
import { Checkbox } from '@workspace/ui/components/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@workspace/ui/components/field'
import { Input } from '@workspace/ui/components/input'
import * as React from 'react'
import { errorCode } from '../graphql/admin-error'
import { csvRoles } from '../lib/role-delegation'
import { createUser } from '../server/users.server'
import { RolePicker } from './role-picker'

const usersRouteApi = getRouteApi('/_authed/users')

export function UserCreateDialog({ open, onOpenChange, onCreated }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}) {
  const { t } = useTranslate()
  const { me } = usersRouteApi.useRouteContext()
  const qc = useQueryClient()
  const [name, setName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [roles, setRoles] = React.useState<string[]>([])
  const [invite, setInvite] = React.useState(true)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const reset = () => {
    setName('')
    setEmail('')
    setRoles([])
    setInvite(true)
    setError(null)
  }

  const handleOpenChange = (next: boolean) => {
    if (!next)
      reset()
    onOpenChange(next)
  }

  const submit = async () => {
    setPending(true)
    setError(null)
    try {
      await createUser({ data: { email: email.trim(), name: name.trim(), roles, invite } })
      await qc.invalidateQueries({ queryKey: ['users'] })
      reset()
      onOpenChange(false)
      onCreated()
    }
    catch (e) {
      const code = errorCode(e)
      setError(code ? t(`users.error.${code}`, t('users.error.generic')) : t('users.error.generic'))
    }
    finally {
      setPending(false)
    }
  }

  const valid = name.trim().length > 0 && /.[^\n\r@\u2028\u2029]*@.+\..+/.test(email)

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[85dvh] grid-rows-[auto_minmax(0,1fr)_auto] gap-[18px] p-6 sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold tracking-tight">{t('users.create.title')}</DialogTitle>
          <DialogDescription>{t('users.create.subtitle')}</DialogDescription>
        </DialogHeader>
        <div className="-mx-2 min-h-0 overflow-y-auto px-2">
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel htmlFor="cu-name">{t('users.create.name')}</FieldLabel>
              <Input id="cu-name" value={name} onChange={e => setName(e.target.value)} autoComplete="off" />
            </Field>
            <Field>
              <FieldLabel htmlFor="cu-email">{t('users.create.email')}</FieldLabel>
              <Input id="cu-email" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="off" />
            </Field>
            <Field>
              <FieldLabel>{t('users.create.roles')}</FieldLabel>
              <RolePicker value={roles} onChange={setRoles} actorRoles={csvRoles(me.role)} />
            </Field>
            <Field orientation="horizontal">
              <Checkbox id="cu-invite" checked={invite} onCheckedChange={checked => setInvite(checked)} />
              <FieldContent>
                <FieldLabel htmlFor="cu-invite">{t('users.create.invite')}</FieldLabel>
                <FieldDescription>{t('users.create.inviteHint')}</FieldDescription>
              </FieldContent>
            </Field>
            {error ? <FieldError>{error}</FieldError> : null}
          </FieldGroup>
        </div>
        <DialogFooter className="-mx-6 -mb-6 p-6">
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={pending}>{t('common.cancel')}</Button>
          <Button onClick={submit} disabled={!valid || pending}>{t('users.create.submit')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
