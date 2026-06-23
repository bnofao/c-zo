'use client'

import { useRouter } from '@tanstack/react-router'
import { useTolgee, useTranslate } from '@tolgee/react'
import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@workspace/ui/components/dropdown-menu'
import { Languages } from 'lucide-react'
import { setLocale } from '../i18n/locale.server'
import { LOCALES } from '../i18n/locales'

const LABELS: Record<(typeof LOCALES)[number], string> = {
  'en': 'English',
  'fr-FR': 'Français',
}

export function LocaleSwitcher() {
  const tolgee = useTolgee(['language'])
  const { t } = useTranslate()
  const router = useRouter()
  const current = tolgee.getLanguage() ?? 'en'

  async function onChange(next: string) {
    if (next === current)
      return
    await tolgee.changeLanguage(next)
    await setLocale({ data: { locale: next } })
    await router.invalidate()
  }

  return (
    <>
      <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
        <Languages className="size-3.5" />
        {t('nav.language')}
      </div>
      <DropdownMenuRadioGroup value={current} onValueChange={onChange}>
        {LOCALES.map(tag => (
          <DropdownMenuRadioItem key={tag} value={tag}>
            {LABELS[tag]}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </>
  )
}
