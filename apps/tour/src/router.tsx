import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRouter } from '@tanstack/react-router'
import { routerWithQueryClient } from '@tanstack/react-router-with-query'
import { routeTree } from './routeTree.gen'

export function createAppRouter() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000 } },
  })

  const router = createRouter({
    routeTree,
    defaultPreloadStaleTime: 0,
    context: { queryClient },
    scrollRestoration: true,
    // Router-level fallback for any unmatched route or `notFound()` thrown by a
    // loader. Without it TanStack logs a warning and renders a bare <p>Not Found</p>.
    defaultNotFoundComponent: () => (
      <div className="p-6 text-sm text-muted-foreground">Page introuvable.</div>
    ),
    Wrap: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  })

  return routerWithQueryClient(router, queryClient)
}

// Required by @tanstack/react-start plugin — resolves as #tanstack-router-entry
export async function getRouter() {
  return createAppRouter()
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}
