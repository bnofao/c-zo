import { Link } from '@tanstack/react-router'
import { useTranslate } from '@tolgee/react'
import { Badge } from '@workspace/ui/components/badge'
import { Button, buttonVariants } from '@workspace/ui/components/button'
import { Separator } from '@workspace/ui/components/separator'
import { Lock } from 'lucide-react'

/**
 * 403 Access-Denied panel — implements the `403 Czo.html` Claude Design mockup
 * (project fb2773fc) with the real `@workspace/ui` kit. Rendered in place by the
 * route error boundary when a user lacks the permission for a page's data.
 */
export function Forbidden() {
  const { t } = useTranslate()
  return (
    <div className="flex min-h-[70vh] items-center justify-center p-8">
      <div className="w-full max-w-[460px] text-center">
        {/* status mark */}
        <div className="mx-auto mb-[22px] grid size-[76px] place-items-center rounded-[20px] border border-border bg-background shadow-sm">
          <Lock className="size-[34px] text-destructive" strokeWidth={1.7} />
        </div>

        <Badge variant="destructive" className="mb-4">{t('errors.forbidden.badge')}</Badge>

        <h1 className="mb-2.5 text-[28px] font-[650] tracking-[-0.03em]">
          {t('errors.forbidden.title')}
        </h1>
        <p className="mx-auto max-w-[380px] text-[15px] leading-[1.55] text-muted-foreground">
          {t('errors.forbidden.description')}
        </p>

        <div className="mt-[26px] flex justify-center gap-2.5">
          <Button variant="outline" onClick={() => window.history.back()}>
            {t('errors.forbidden.back')}
          </Button>
          <Link to="/" className={buttonVariants()}>
            {t('errors.forbidden.dashboard')}
          </Link>
        </div>

        <Separator className="mt-[30px] mb-4" />
        <p className="text-[12.5px] text-muted-foreground">
          {t('errors.forbidden.reference')}
          {' '}
          <span className="font-mono">ERR_403_FORBIDDEN</span>
          {' · Czo Admin'}
        </p>
      </div>
    </div>
  )
}
