import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from '@tanstack/react-router'
import { TolgeeProvider } from '@tolgee/react'
import * as React from 'react'
import { getLocale } from '../i18n/locale.server'
import { createTolgee } from '../i18n/tolgee'
import styles from '../styles.css?url'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  // Read the locale server-side so the very first SSR render uses it. On client
  // navigations this is served from the dehydrated loader data; the switcher
  // calls `router.invalidate()` to re-run it after changing the cookie.
  loader: async () => ({ locale: await getLocale() }),
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'tour — admin' },
    ],
    links: [{ rel: 'stylesheet', href: styles }],
  }),
  component: RootDocument,
})

function RootDocument() {
  const { locale } = Route.useLoaderData()
  // Build a PLAIN instance for the server render and the first client render, so
  // the markup matches and hydration succeeds. The initial language matches the
  // SSR-resolved locale.
  const [tolgee, setTolgee] = React.useState(() => createTolgee(locale))

  React.useEffect(() => {
    // After hydration, upgrade to the in-context (DevTools) instance for
    // Alt+click editing. Its observer injects invisible markers that would break
    // hydration if present on the first render — so it only attaches now. DEV +
    // an API key only; the `DEV` guard keeps DevTools and the key out of prod.
    if (import.meta.env.DEV && import.meta.env.VITE_TOLGEE_API_KEY) {
      // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- one-time post-hydration upgrade
      setTolgee(createTolgee(locale, true))
    }
  }, [locale])

  return (
    // suppressHydrationWarning: browser extensions (Dark Reader, Grammarly, …)
    // mutate <html> before React hydrates. Scoped to this element only.
    <html lang={locale} suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <TolgeeProvider tolgee={tolgee} options={{ useSuspense: false }}>
          <Outlet />
        </TolgeeProvider>
        <Scripts />
      </body>
    </html>
  )
}
