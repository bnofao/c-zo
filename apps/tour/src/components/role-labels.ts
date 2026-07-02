import { useQuery } from '@tanstack/react-query'
import { useTranslate } from '@tolgee/react'
import * as React from 'react'
import { roleHierarchiesQueryOptions } from './users-query'

type TFn = ReturnType<typeof useTranslate>['t']

/** Fallback domain label when no i18n key is registered (e.g. "stock-location" → "Stock Location"). */
const prettify = (name: string) => name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

/** Localized domain label; falls back to a prettified domain name. */
export function domainLabel(t: TFn, name: string): string {
  return t(`users.roleDomain.${name}`, prettify(name))
}

/**
 * Short localized tier label from a role token. Every hierarchy's tiers are
 * structurally member/viewer/manager/admin/owner, so we label by the tier suffix
 * (the segment after the last ':') via a small generic key set. Falls back to the suffix.
 */
export function tierLabel(t: TFn, token: string): string {
  const suffix = token.slice(token.lastIndexOf(':') + 1)
  return t(`users.roleTier.tier.${suffix}`, suffix)
}

/**
 * Qualified "Domain · Tier" label for a single role token — used by the users
 * table badges, which have only the token. Resolves the domain via the registry
 * (so `stock-loc:viewer` maps to the `stock-location` hierarchy), falling back to
 * the token's first segment.
 */
export function useRoleLabel() {
  const { t } = useTranslate()
  const { data: hierarchies = [] } = useQuery(roleHierarchiesQueryOptions())
  const domainOf = React.useMemo(() => {
    const m = new Map<string, string>()
    for (const h of hierarchies) {
      for (const tier of h.tiers) m.set(tier.name, h.name)
    }
    return m
  }, [hierarchies])
  return (token: string) => {
    const domain = domainOf.get(token) ?? (token.includes(':') ? token.slice(0, token.indexOf(':')) : token)
    return `${domainLabel(t, domain)} · ${tierLabel(t, token)}`
  }
}
