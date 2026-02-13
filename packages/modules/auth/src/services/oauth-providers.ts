export const SUPPORTED_PROVIDERS = ['google', 'github'] as const

export type SupportedProvider = (typeof SUPPORTED_PROVIDERS)[number]

const PROVIDER_RESTRICTIONS: Record<string, readonly SupportedProvider[]> = {
  customer: ['google'],
  admin: ['github'],
}

export function isProviderAllowedForActor(provider: string, actor: string): boolean {
  const allowed = PROVIDER_RESTRICTIONS[actor]
  if (!allowed)
    return false
  return allowed.includes(provider as SupportedProvider)
}

export function getSupportedProvidersForActor(actor: string): string[] {
  return [...(PROVIDER_RESTRICTIONS[actor] ?? [])]
}
