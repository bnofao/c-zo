import type { UserRow } from '../server/users.server'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslate } from '@tolgee/react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@workspace/ui/components/alert-dialog'
import { Label } from '@workspace/ui/components/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@workspace/ui/components/select'
import { Textarea } from '@workspace/ui/components/textarea'
import { cn } from '@workspace/ui/lib/utils'
import { Ban, CircleCheck } from 'lucide-react'
import * as React from 'react'
import { errorCode } from '../graphql/admin-error'
import { banUser, unbanUser } from '../server/users.server'
import { UserChip } from './user-chip'

const BAN_REASONS = ['rules', 'suspicious', 'spam', 'requested', 'other'] as const

export function UserBanDialog({ action, onOpenChange }: {
  action: { type: 'ban' | 'activate', user: UserRow } | null
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslate()
  const qc = useQueryClient()
  const [reason, setReason] = React.useState('')
  const [details, setDetails] = React.useState('')
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- reinitialize local state from the target action when it changes
    setReason('')
    // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- ditto
    setDetails('')
    // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- ditto
    setError(null)
  }, [action])

  const isBan = action?.type === 'ban'
  const valid = !isBan || (reason.length > 0 && (reason !== 'other' || details.trim().length > 0))

  const submit = async () => {
    if (!action)
      return
    setPending(true)
    setError(null)
    try {
      if (action.type === 'ban') {
        const label = t(`users.ban.reason.${reason}`)
        const composed = details.trim() ? `${label} — ${details.trim()}` : label
        await banUser({ data: { id: action.user.id, reason: composed } })
      }
      else {
        await unbanUser({ data: { id: action.user.id } })
      }
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
    <AlertDialog open={action != null} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <div className="flex items-start gap-3.5">
            <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg', isBan ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary')}>
              {isBan ? <Ban className="size-5" /> : <CircleCheck className="size-5" />}
            </span>
            <div className="flex flex-col gap-1.5">
              <AlertDialogTitle>{isBan ? t('users.ban.title') : t('users.activate.title')}</AlertDialogTitle>
              <AlertDialogDescription>{isBan ? t('users.ban.subtitle') : t('users.activate.subtitle')}</AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>
        {action ? <UserChip user={action.user} /> : null}
        {isBan
          ? (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label>{t('users.ban.reasonLabel')}</Label>
                  <Select value={reason} onValueChange={v => setReason(v ?? '')}>
                    <SelectTrigger>
                      <SelectValue>{(v: string) => v ? t(`users.ban.reason.${v}`) : t('users.ban.reasonPlaceholder')}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {BAN_REASONS.map(r => (
                        <SelectItem key={r} value={r}>{t(`users.ban.reason.${r}`)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>{t('users.ban.detailsLabel')}</Label>
                  <Textarea value={details} onChange={e => setDetails(e.target.value)} rows={3} />
                </div>
                {error ? <p className="text-sm text-destructive">{error}</p> : null}
              </div>
            )
          : (error ? <p className="text-sm text-destructive">{error}</p> : null)}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={submit}
            disabled={!valid || pending}
            className={isBan ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : undefined}
          >
            {isBan ? t('users.ban.confirm') : t('users.activate.confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
