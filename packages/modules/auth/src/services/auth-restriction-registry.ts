// ─── Types ────────────────────────────────────────────────────────────

export type AuthMethod = 'email' | 'two-factor' | `oauth:${string}`

export interface ActorRestrictionConfig {
  allowedMethods: readonly AuthMethod[]
  priority: number
  require2FA?: boolean
  sessionDuration?: number
  allowImpersonation?: boolean
}

export interface ActorTypeProvider {
  actorType: string
  hasActorType: (userId: string) => Promise<boolean>
}

export interface EffectiveAuthConfig {
  require2FA: boolean
  sessionDuration: number
  allowImpersonation: boolean
  dominantActorType: string
  allowedMethods: string[]
  actorTypes: string[]
}

// ─── Defaults ─────────────────────────────────────────────────────────

const DEFAULT_SESSION_DURATION = 604800 // 7 days

export const DEFAULT_RESTRICTION_CONFIG: ActorRestrictionConfig = {
  allowedMethods: ['email'],
  priority: 0,
  require2FA: false,
  sessionDuration: DEFAULT_SESSION_DURATION,
  allowImpersonation: false,
}

// ─── Registry ─────────────────────────────────────────────────────────

export class AuthRestrictionRegistry {
  private readonly configs = new Map<string, ActorRestrictionConfig>()
  private readonly providers = new Map<string, ActorTypeProvider>()
  private frozen = false

  registerActorType(actorType: string, config: ActorRestrictionConfig): void {
    if (this.frozen) {
      throw new Error(`Cannot register actor type "${actorType}" — registry is frozen`)
    }
    if (this.configs.has(actorType)) {
      throw new Error(`Actor type "${actorType}" is already registered`)
    }
    this.configs.set(actorType, config)
  }

  registerActorProvider(provider: ActorTypeProvider): void {
    if (this.frozen) {
      throw new Error(`Cannot register provider for "${provider.actorType}" — registry is frozen`)
    }
    if (this.providers.has(provider.actorType)) {
      throw new Error(`Provider for actor type "${provider.actorType}" is already registered`)
    }
    this.providers.set(provider.actorType, provider)
  }

  getActorConfig(actorType: string): ActorRestrictionConfig {
    return this.configs.get(actorType) ?? DEFAULT_RESTRICTION_CONFIG
  }

  isMethodAllowed(actorType: string, method: AuthMethod): boolean {
    const config = this.getActorConfig(actorType)
    return config.allowedMethods.includes(method)
  }

  async hasActorType(userId: string, actorType: string): Promise<boolean> {
    const provider = this.providers.get(actorType)
    if (!provider) {
      return false
    }
    return provider.hasActorType(userId)
  }

  async getEffectiveConfig(userId: string): Promise<EffectiveAuthConfig> {
    const matchedTypes: string[] = []
    const matchedConfigs: ActorRestrictionConfig[] = []

    for (const [actorType, provider] of this.providers) {
      if (await provider.hasActorType(userId)) {
        matchedTypes.push(actorType)
        matchedConfigs.push(this.getActorConfig(actorType))
      }
    }

    if (matchedConfigs.length === 0) {
      return {
        require2FA: DEFAULT_RESTRICTION_CONFIG.require2FA ?? false,
        sessionDuration: DEFAULT_RESTRICTION_CONFIG.sessionDuration ?? DEFAULT_SESSION_DURATION,
        allowImpersonation: DEFAULT_RESTRICTION_CONFIG.allowImpersonation ?? false,
        dominantActorType: 'unknown',
        allowedMethods: [...DEFAULT_RESTRICTION_CONFIG.allowedMethods],
        actorTypes: [],
      }
    }

    // Most-restrictive-wins: OR require2FA, MIN sessionDuration, AND allowImpersonation, intersect methods
    const require2FA = matchedConfigs.some(c => c.require2FA === true)
    const sessionDuration = Math.min(
      ...matchedConfigs.map(c => c.sessionDuration ?? DEFAULT_SESSION_DURATION),
    )
    const allowImpersonation = matchedConfigs.every(c => c.allowImpersonation === true)

    // Intersect allowedMethods across all matched configs
    let allowedMethods: string[] = [...matchedConfigs[0]!.allowedMethods]
    for (let i = 1; i < matchedConfigs.length; i++) {
      const methodSet = new Set<string>(matchedConfigs[i]!.allowedMethods)
      allowedMethods = allowedMethods.filter(m => methodSet.has(m))
    }

    // Dominant = highest priority
    const dominantIdx = matchedConfigs.reduce(
      (maxIdx, c, idx) => (c.priority > matchedConfigs[maxIdx]!.priority ? idx : maxIdx),
      0,
    )

    return {
      require2FA,
      sessionDuration,
      allowImpersonation,
      dominantActorType: matchedTypes[dominantIdx]!,
      allowedMethods,
      actorTypes: matchedTypes,
    }
  }

  getRegisteredActorTypes(): string[] {
    return [...this.configs.keys()]
  }

  freeze(): void {
    this.frozen = true
  }

  isFrozen(): boolean {
    return this.frozen
  }
}

// ─── Singleton ────────────────────────────────────────────────────────

export function useAuthRestrictionRegistry(): AuthRestrictionRegistry {
  return ((useAuthRestrictionRegistry as any).__instance__ ??= new AuthRestrictionRegistry())
}
