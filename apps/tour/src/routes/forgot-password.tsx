import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { useTranslate } from '@tolgee/react'
import { Button } from '@workspace/ui/components/button'
import { Field, FieldLabel } from '@workspace/ui/components/field'
import { Input } from '@workspace/ui/components/input'
import { ArrowLeft, Mail } from 'lucide-react'
import * as React from 'react'
import { AuthShell } from '../components/auth-shell'
import { requestPasswordReset } from '../server/reset.server'

export const Route = createFileRoute('/forgot-password')({
  // Same reverse guard as /login: an authenticated user manages their password
  // from their account, not the public reset flow.
  beforeLoad: ({ context }) => {
    if (context.me)
      throw redirect({ to: '/' })
  },
  component: ForgotPasswordPage,
})

function BackToLogin() {
  const { t } = useTranslate()
  return (
    <Link
      to="/login"
      className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-3.5" />
      {t('reset.backToLogin')}
    </Link>
  )
}

function ForgotPasswordPage() {
  const { t } = useTranslate()
  const [sentTo, setSentTo] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [resent, setResent] = React.useState(false)

  async function send(email: string) {
    setError(null)
    setPending(true)
    try {
      await requestPasswordReset({ data: { email } })
      return true
    }
    catch {
      setError(t('reset.error.generic'))
      return false
    }
    finally {
      setPending(false)
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const email = String(new FormData(e.currentTarget).get('email')).trim()
    if (await send(email))
      setSentTo(email)
  }

  async function onResend() {
    if (sentTo && await send(sentTo))
      setResent(true)
  }

  return (
    <AuthShell badge={t('reset.brandBadge')} tagline={t('reset.brandTagline')} copyright={t('login.copyright')}>
      {sentTo === null
        ? (
            <>
              <h1 className="mb-1 text-[22px] font-semibold tracking-tight">{t('reset.request.title')}</h1>
              <p className="mb-6 text-sm text-pretty text-muted-foreground">{t('reset.request.subtitle')}</p>

              <form className="flex flex-col gap-4" onSubmit={onSubmit}>
                <Field>
                  <FieldLabel htmlFor="fp-email">{t('reset.request.emailLabel')}</FieldLabel>
                  <Input
                    id="fp-email"
                    name="email"
                    type="email"
                    placeholder={t('reset.request.emailPlaceholder')}
                    autoComplete="email"
                    required
                  />
                </Field>
                {error ? <p className="text-sm text-destructive">{error}</p> : null}
                <Button type="submit" className="w-full" disabled={pending}>{t('reset.request.submit')}</Button>
              </form>
            </>
          )
        : (
            <>
              <div className="mb-4 grid size-13 place-items-center rounded-xl bg-secondary text-secondary-foreground">
                <Mail className="size-6.5" strokeWidth={1.8} />
              </div>
              <h1 className="mb-1 text-[22px] font-semibold tracking-tight">{t('reset.sent.title')}</h1>
              <p className="mb-6 text-sm text-pretty text-muted-foreground">
                {t('reset.sent.bodyPrefix')}
                {' '}
                <strong className="font-semibold text-foreground">{sentTo}</strong>
                {t('reset.sent.bodySuffix')}
              </p>
              <div role="note" className="mb-6 rounded-lg bg-muted px-3.5 py-3 text-[13px] text-muted-foreground">
                {t('reset.sent.note')}
              </div>
              {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}
              <Button variant="outline" className="w-full" disabled={pending} onClick={onResend}>
                {resent ? t('reset.sent.resent') : t('reset.sent.resend')}
              </Button>
            </>
          )}
      <div className="mt-6">
        <BackToLogin />
      </div>
    </AuthShell>
  )
}
