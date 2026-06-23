import { useTranslate } from '@tolgee/react'

export function NotFound() {
  const { t } = useTranslate()
  return <div className="p-6 text-sm text-muted-foreground">{t('common.notFound')}</div>
}
