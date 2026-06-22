import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from '@tanstack/react-router'
import styles from '../styles.css?url'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
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
  return (
    // suppressHydrationWarning: browser extensions (Dark Reader, Grammarly, …)
    // and theme scripts commonly mutate <html>'s class/attributes before React
    // hydrates, which would otherwise log a hydration mismatch. Scoped to this
    // one element (not its children); our <html> only carries a static `lang`,
    // so this never masks a real mismatch.
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  )
}
