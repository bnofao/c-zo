import { createFileRoute, Link, redirect, useRouter } from '@tanstack/react-router'
import { useTranslate } from '@tolgee/react'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import { Eye, EyeOff } from 'lucide-react'
import * as React from 'react'
import { AuthShell } from '../components/auth-shell'
import { signIn } from '../server/auth.server'

export const Route = createFileRoute('/login')({
  // Reverse of the `_authed` guard: an already-authenticated user has no
  // business on the login page — send them to the dashboard. Reads the `me`
  // resolved in the root beforeLoad (no extra fetch).
  beforeLoad: ({ context }) => {
    if (context.me)
      throw redirect({ to: '/' })
  },
  component: LoginPage,
})

function LoginPage() {
  const { t } = useTranslate()
  const router = useRouter()
  const [show, setShow] = React.useState(false)
  const [remember, setRemember] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setPending(true)
    const form = new FormData(e.currentTarget)
    try {
      const res = await signIn({ data: { email: String(form.get('identifier')), password: String(form.get('password')) } })
      if (res.ok) {
        // Refresh the root-level `me` (the new session cookie is now set) before
        // navigating, so the `_authed` guard sees the authenticated context.
        await router.invalidate()
        await router.navigate({ to: '/' })
      }
      else {
        setError(t('login.invalidCredentials'))
      }
    }
    catch {
      setError(t('login.invalidCredentials'))
    }
    finally {
      setPending(false)
    }
  }

  return (
    <AuthShell badge={t('login.brandBadge')} tagline={t('login.brandTagline')} copyright={t('login.copyright')}>
      <h1 className="mb-1 text-[22px] font-semibold tracking-tight">{t('login.title')}</h1>
      <p className="mb-6 text-sm text-muted-foreground">{t('login.subtitle')}</p>

      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="identifier" className="text-sm font-medium">{t('login.identifierLabel')}</label>
          <Input
            id="identifier"
            name="identifier"
            type="text"
            placeholder={t('login.identifierPlaceholder')}
            autoComplete="username"
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-sm font-medium">{t('login.passwordLabel')}</label>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={show ? 'text' : 'password'}
              placeholder="••••••••••"
              autoComplete="current-password"
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
        </div>

        <div className="flex items-center justify-between gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground select-none">
            <input
              type="checkbox"
              checked={remember}
              onChange={e => setRemember(e.target.checked)}
              className="size-[15px] accent-primary"
            />
            {t('login.remember')}
          </label>
          <Link to="/forgot-password" className="text-sm font-medium hover:underline">
            {t('login.forgot')}
          </Link>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <Button type="submit" className="w-full" disabled={pending}>{t('login.submit')}</Button>
      </form>
    </AuthShell>
  )
}
