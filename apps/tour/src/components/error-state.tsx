import { useTranslate } from '@tolgee/react'
import { Button } from '@workspace/ui/components/button'
import { TriangleAlert } from 'lucide-react'

/**
 * Generic data-error panel with a retry action. Rendered in place by the route
 * error boundary for non-permission failures (network / 500). Shares the
 * Access-Denied panel's visual language.
 */
export function ErrorState({ reset }: { reset?: () => void }) {
  const { t } = useTranslate()
  return (
    <div className="flex min-h-[70vh] items-center justify-center p-8">
      <div className="w-full max-w-[460px] text-center">
        <div className="mx-auto mb-[22px] grid size-[76px] place-items-center rounded-[20px] border border-border bg-background shadow-sm">
          <TriangleAlert className="size-[34px] text-muted-foreground" strokeWidth={1.7} />
        </div>

        <h1 className="mb-2.5 text-[28px] font-[650] tracking-[-0.03em]">
          {t('errors.generic.title')}
        </h1>
        <p className="mx-auto max-w-[380px] text-[15px] leading-[1.55] text-muted-foreground">
          {t('errors.generic.description')}
        </p>

        {reset
          ? (
              <div className="mt-[26px] flex justify-center">
                <Button variant="outline" onClick={reset}>{t('errors.generic.retry')}</Button>
              </div>
            )
          : null}
      </div>
    </div>
  )
}
