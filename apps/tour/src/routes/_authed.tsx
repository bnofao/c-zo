import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { useTranslate } from '@tolgee/react'
import { Separator } from '@workspace/ui/components/separator'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@workspace/ui/components/sidebar'
import { TooltipProvider } from '@workspace/ui/components/tooltip'
import { AppSidebar } from '../components/app-sidebar'

export const Route = createFileRoute('/_authed')({
  // `me` is resolved once in the root `beforeLoad`; here we only gate. Re-return
  // it narrowed to non-null so descendants get `context.me: MeUser`.
  beforeLoad: ({ context }) => {
    if (!context.me)
      throw redirect({ to: '/login' })
    return { me: context.me }
  },
  component: AuthedLayout,
})

function AuthedLayout() {
  const { me } = Route.useRouteContext()
  const { t } = useTranslate()
  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar me={me} />
        <SidebarInset>
          <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <span className="text-sm font-medium">{t('nav.appName')}</span>
          </header>
          <div className="flex-1 p-6">
            <Outlet />
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
