import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { useTranslate } from '@tolgee/react'
import { Button } from '@workspace/ui/components/button'
import { Field, FieldLabel } from '@workspace/ui/components/field'
import { Input } from '@workspace/ui/components/input'
import { ArrowLeft, Check, Eye, EyeOff } from 'lucide-react'
import * as React from 'react'
import { AuthShell } from '../components/auth-shell'
import { errorCode } from '../graphql/admin-error'
import { resetPassword } from '../server/reset.server'

export const Route = createFileRoute('/reset-password')({
  // No auth guard: the flow is gated by the emailed token, not a session
  // (invitation emails land here too). A missing token has nothing to reset.
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === 'string' ? search.token : '',
  }),
  beforeLoad: ({ search }) => {
    if (!search.token)
      throw redirect({ to: '/forgot-password' })
  },
  component: ResetPasswordPage,
})

/* Password strength — same scoring/labels as the design mock. Visual aid
 * only; the API enforces its own password policy. */
function scorePassword(pw: string): number {
  if (!pw)
    return 0
  let s = 0
  if (pw.length >= 8)
    s++
  if (pw.length >= 12)
    s++
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw))
    s++
  if (/\d/.test(pw))
    s++
  if (/[^a-z0-9]/i.test(pw))
    s++
  return Math.min(s, 4)
}

/** Client mirror of the API's `passwordSchema` (8–20, upper, lower, digit, special). */
function meetsPolicy(pw: string): boolean {
  return pw.length >= 8 && pw.length <= 20
    && /[A-Z]/.test(pw) && /[a-z]/.test(pw) && /\d/.test(pw) && /[!@#$%^&*]/.test(pw)
}

const STRENGTH_COLORS = [
  'var(--muted-foreground)',
  'oklch(0.62 0.2 25)',
  'oklch(0.72 0.16 65)',
  'oklch(0.68 0.14 145)',
  'oklch(0.6 0.15 150)',
]

function StrengthMeter({ value }: { value: string }) {
  const { t } = useTranslate()
  const score = scorePassword(value)
  const color = STRENGTH_COLORS[score]
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map(i => (
          <div
            key={i}
            className="h-1 flex-1 rounded-full transition-colors"
            style={{ background: value && i < score ? color : 'var(--border)' }}
          />
        ))}
      </div>
      {value
        ? (
            <span className="text-xs font-medium" style={{ color }}>
              {t('reset.strength.label')}
              {' '}
              {t(`reset.strength.${score}`)}
            </span>
          )
        : null}
    </div>
  )
}

function ResetPasswordPage() {
  const { t } = useTranslate()
  const { token } = Route.useSearch()
  const [pw, setPw] = React.useState('')
  const [confirm, setConfirm] = React.useState('')
  const [show, setShow] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [done, setDone] = React.useState(false)

  const mismatch = confirm.length > 0 && confirm !== pw
  const submittable = meetsPolicy(pw) && pw === confirm

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!submittable)
      return
    setError(null)
    setPending(true)
    try {
      await resetPassword({ data: { token, newPassword: pw } })
      setDone(true)
    }
    catch (e) {
      const code = errorCode(e)
      setError(code ? t(`reset.error.${code}`, t('reset.error.generic')) : t('reset.error.generic'))
    }
    finally {
      setPending(false)
    }
  }

  return (
    <AuthShell badge={t('reset.brandBadge')} tagline={t('reset.brandTagline')} copyright={t('login.copyright')}>
      {done
        ? (
            <>
              <div className="mb-4 grid size-13 place-items-center rounded-xl bg-[color-mix(in_oklab,oklch(0.6_0.15_150)_15%,transparent)] text-[oklch(0.55_0.15_150)]">
                <Check className="size-7" strokeWidth={2.2} />
              </div>
              <h1 className="mb-1 text-[22px] font-semibold tracking-tight">{t('reset.done.title')}</h1>
              <p className="mb-6 text-sm text-pretty text-muted-foreground">{t('reset.done.body')}</p>
              <Button className="w-full" render={<Link to="/login" />}>
                {t('reset.done.cta')}
              </Button>
            </>
          )
        : (
            <>
              <h1 className="mb-1 text-[22px] font-semibold tracking-tight">{t('reset.reset.title')}</h1>
              <p className="mb-6 text-sm text-pretty text-muted-foreground">{t('reset.reset.subtitle')}</p>

              <form className="flex flex-col gap-4" onSubmit={onSubmit}>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel htmlFor="rp-new">{t('reset.reset.newLabel')}</FieldLabel>
                  <div className="relative">
                    <Input
                      id="rp-new"
                      type={show ? 'text' : 'password'}
                      placeholder="••••••••••"
                      autoComplete="new-password"
                      value={pw}
                      onChange={e => setPw(e.target.value)}
                      className="pr-10"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShow(s => !s)}
                      aria-label={t(show ? 'login.hidePassword' : 'login.showPassword')}
                      className="absolute top-1/2 right-1.5 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:text-foreground"
                    >
                      {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                  <StrengthMeter value={pw} />
                </div>

                <Field data-invalid={mismatch || undefined}>
                  <FieldLabel htmlFor="rp-confirm">{t('reset.reset.confirmLabel')}</FieldLabel>
                  <Input
                    id="rp-confirm"
                    type={show ? 'text' : 'password'}
                    placeholder="••••••••••"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    aria-invalid={mismatch || undefined}
                    required
                  />
                  {mismatch ? <p className="text-sm text-destructive">{t('reset.reset.mismatch')}</p> : null}
                </Field>

                {error ? <p className="text-sm text-destructive">{error}</p> : null}

                <Button type="submit" className="w-full" disabled={pending || !submittable}>
                  {t('reset.reset.submit')}
                </Button>
              </form>
              <div className="mt-6">
                <Link
                  to="/login"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="size-3.5" />
                  {t('reset.backToLogin')}
                </Link>
              </div>
            </>
          )}
    </AuthShell>
  )
}
