import { useQuery } from '@tanstack/react-query'
import { useTranslate } from '@tolgee/react'
import { Button } from '@workspace/ui/components/button'
import { ScrollArea } from '@workspace/ui/components/scroll-area'
import { ToggleGroup, ToggleGroupItem } from '@workspace/ui/components/toggle-group'
import { cn } from '@workspace/ui/lib/utils'
import * as React from 'react'
import { heldTiers } from '../lib/role-delegation'
import { domainLabel, tierLabel } from './role-labels'
import { roleHierarchiesQueryOptions } from './users-query'

// Selected chip → filled primary (the DS toggle's default "on" state is muted).
const CHIP_ON = 'data-[pressed]:bg-primary data-[pressed]:text-primary-foreground data-[pressed]:shadow-sm aria-pressed:bg-primary aria-pressed:text-primary-foreground'

/**
 * Per-domain role selection: one single-select `ToggleGroup` (segmented control)
 * per registered hierarchy — at most one tier per domain (clicking the active tier
 * clears it → "none"). The domain a token belongs to is resolved from the registry,
 * not string-parsed, so prefixes like `stock-loc` map to `stock-location` correctly.
 *
 * Chips follow the delegated-admin guard (UX mirror of the backend rules):
 *  • editing yourself — domains you already hold are frozen; new domains are
 *    free at any tier (self-onboarding).
 *  • editing/creating others — only domains you hold, at tiers ≤ your own.
 * "Clear all" only clears the editable domains.
 */
export function RolePicker({ value, onChange, actorRoles, isSelf = false }: {
  value: string[]
  onChange: (roles: string[]) => void
  actorRoles: string[]
  isSelf?: boolean
}) {
  const { t } = useTranslate()
  const { data: hierarchies = [] } = useQuery(roleHierarchiesQueryOptions())
  const domainOf = React.useMemo(() => {
    const m = new Map<string, string>()
    for (const h of hierarchies) {
      for (const tier of h.tiers) m.set(tier.name, h.name)
    }
    return m
  }, [hierarchies])
  const actorTiers = React.useMemo(() => heldTiers(hierarchies, actorRoles), [hierarchies, actorRoles])

  const domainEditable = (domain: string) => (isSelf ? !actorTiers.has(domain) : actorTiers.has(domain))
  // Self-onboarding is unbounded; delegating to others caps at the actor's tier.
  const tierDisabled = (domain: string, idx: number) =>
    !domainEditable(domain) || (!isSelf && idx > (actorTiers.get(domain) ?? -1))

  const selectedFor = (domain: string) => value.find(r => domainOf.get(r) === domain)
  const setForDomain = (domain: string, tier: string | null) => {
    const rest = value.filter(r => domainOf.get(r) !== domain)
    onChange(tier ? [...rest, tier] : rest)
  }
  const configured = new Set(value.map(r => domainOf.get(r)).filter(Boolean)).size
  // Locked tokens (frozen self domains, domains the actor can't touch, tokens
  // outside the visible registry) must survive "clear all" untouched.
  const clearable = value.filter((r) => {
    const domain = domainOf.get(r)
    return domain !== undefined && domainEditable(domain)
  })

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex min-h-6 items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{t('users.roles.hint')}</span>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">{t('users.roles.configured', { count: configured })}</span>
          {clearable.length > 0
            ? (
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => onChange(value.filter(r => !clearable.includes(r)))}>
                  {t('users.roles.clearAll')}
                </Button>
              )
            : null}
        </div>
      </div>

      <ScrollArea className="h-60 rounded-xl border">
        {hierarchies.map((h, i) => {
          const selected = selectedFor(h.name)
          return (
            <div
              key={h.name}
              className={cn(
                'grid grid-cols-[minmax(96px,132px)_1fr] items-center gap-3 px-3.5 py-2.5',
                i < hierarchies.length - 1 && 'border-b',
              )}
            >
              <span className={cn('text-sm font-medium', !domainEditable(h.name) && 'text-muted-foreground')}>{domainLabel(t, h.name)}</span>
              <ToggleGroup
                variant="default"
                size="sm"
                spacing={3}
                value={selected ? [selected] : []}
                onValueChange={vals => setForDomain(h.name, vals[0] ?? null)}
                className="ml-auto rounded-lg bg-muted p-[3px]"
              >
                {h.tiers.map((tier, idx) => (
                  <ToggleGroupItem
                    key={tier.name}
                    value={tier.name}
                    disabled={tierDisabled(h.name, idx)}
                    className={cn('rounded-md px-2 text-xs whitespace-nowrap', CHIP_ON)}
                  >
                    {tierLabel(t, tier.name)}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          )
        })}
      </ScrollArea>
    </div>
  )
}
