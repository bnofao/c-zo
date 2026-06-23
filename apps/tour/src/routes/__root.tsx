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
  // Build the instance once per router (per request on the server, once on the
  // client). The initial language matches the SSR-resolved locale, so server
  // and client hydrate identically.
  const [tolgee] = React.useState(() => createTolgee(locale))

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
