import type { MeUser } from '../server/auth.server'
import { Link, useRouterState } from '@tanstack/react-router'
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
import { ChevronRight, Command, LayoutDashboard, Package } from 'lucide-react'
import * as React from 'react'
import { NavUser } from './nav-user'

// Catalog sub-areas without routes yet render as muted placeholders.
const catalogSoon = ['Categories', 'Collections', 'Attributes']

export function AppSidebar({ me, ...props }: { me: MeUser } & React.ComponentProps<typeof Sidebar>) {
  const pathname = useRouterState({ select: s => s.location.pathname })
  const inCatalog = pathname.startsWith('/products')

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
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Dashboard" isActive={pathname === '/'} render={<Link to="/" />}>
                <LayoutDashboard />
                <span>Dashboard</span>
              </SidebarMenuButton>
            </SidebarMenuItem>

            <Collapsible defaultOpen render={<SidebarMenuItem />}>
              <SidebarMenuButton tooltip="Catalog" isActive={inCatalog} render={<Link to="/products" />}>
                <Package />
                <span>Catalog</span>
              </SidebarMenuButton>
              <CollapsibleTrigger render={<SidebarMenuAction className="aria-expanded:rotate-90" />}>
                <ChevronRight />
                <span className="sr-only">Toggle catalog</span>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarMenuSub>
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton isActive={inCatalog} render={<Link to="/products" />}>
                      <span>Products</span>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                  {catalogSoon.map(label => (
                    <SidebarMenuSubItem key={label}>
                      <SidebarMenuSubButton render={<a href="#" onClick={e => e.preventDefault()} />}>
                        <span className="text-muted-foreground">{label}</span>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  ))}
                </SidebarMenuSub>
              </CollapsibleContent>
            </Collapsible>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <NavUser user={me} />
      </SidebarFooter>
    </Sidebar>
  )
}
