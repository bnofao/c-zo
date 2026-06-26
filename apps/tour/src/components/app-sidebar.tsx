import type { MeUser } from '../server/auth.server'
import { Link, useRouterState } from '@tanstack/react-router'
import { useTranslate } from '@tolgee/react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@workspace/ui/components/collapsible'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@workspace/ui/components/sidebar'
import { ChevronRight, Command, LayoutDashboard, Package, Users } from 'lucide-react'
import * as React from 'react'
import { can } from '../lib/rbac'
import { NavUser } from './nav-user'

// Catalog sub-areas without routes yet render as muted placeholders.
const catalogSoon = ['nav.categories', 'nav.collections', 'nav.attributes'] as const

export function AppSidebar({ me, ...props }: { me: MeUser } & React.ComponentProps<typeof Sidebar>) {
  const pathname = useRouterState({ select: s => s.location.pathname })
  const inCatalog = pathname.startsWith('/products')
  const { t } = useTranslate()

  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link to="/" />}>
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <Command className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">Czo</span>
                <span className="truncate text-xs text-muted-foreground">Admin</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t('nav.platform')}</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip={t('nav.dashboard')} isActive={pathname === '/'} render={<Link to="/" />}>
                <LayoutDashboard />
                <span>{t('nav.dashboard')}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>

            <Collapsible defaultOpen render={<SidebarMenuItem />}>
              <SidebarMenuButton tooltip={t('nav.catalog')} isActive={inCatalog} render={<Link to="/products" />}>
                <Package />
                <span>{t('nav.catalog')}</span>
              </SidebarMenuButton>
              <CollapsibleTrigger render={<SidebarMenuAction className="aria-expanded:rotate-90" />}>
                <ChevronRight />
                <span className="sr-only">{t('nav.toggleCatalog')}</span>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarMenuSub>
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton isActive={inCatalog} render={<Link to="/products" />}>
                      <span>{t('nav.products')}</span>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                  {catalogSoon.map(key => (
                    <SidebarMenuSubItem key={key}>
                      <SidebarMenuSubButton render={<a href="#" onClick={e => e.preventDefault()} />}>
                        <span className="text-muted-foreground">{t(key)}</span>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  ))}
                </SidebarMenuSub>
              </CollapsibleContent>
            </Collapsible>

            {can(me, 'user', 'read') && (
              <SidebarMenuItem>
                <SidebarMenuButton tooltip={t('nav.users')} isActive={pathname.startsWith('/users')} render={<Link to="/users" />}>
                  <Users />
                  <span>{t('nav.users')}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <NavUser user={me} />
      </SidebarFooter>
    </Sidebar>
  )
}
