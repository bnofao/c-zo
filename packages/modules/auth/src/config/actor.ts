// ─── Types ────────────────────────────────────────────────────────────

export type AuthMethod = 'email' | 'two-factor' | `oauth:${string}`

export interface ActorConfig {
  allowedMethods: readonly AuthMethod[]
  require2FA?: boolean
  sessionDuration?: number
  allowImpersonation?: boolean
}

export interface ActorProvider {
  type: string
  hasActorType: (userId: string) => Promise<boolean>
}

// ─── Defaults ─────────────────────────────────────────────────────────

const DEFAULT_SESSION_DURATION = 604800 // 7 days

export const DEFAULT_RESTRICTION_CONFIG: ActorConfig = {
  allowedMethods: ['email'],
  require2FA: false,
  sessionDuration: DEFAULT_SESSION_DURATION,
  allowImpersonation: false,
}

// ─── Factory ──────────────────────────────────────────────────────────

export type AuthActorService = ReturnType<typeof createAuthActorService>

export function createAuthActorService() {
  const configs = new Map<string, ActorConfig>()
  const providers = new Map<string, ActorProvider>()
  let frozen = false

  function registerActor(type: string, config: ActorConfig): void {
    if (frozen) {
      throw new Error(`Cannot register actor type "${type}" — registry is frozen`)
    }
    if (configs.has(type)) {
      throw new Error(`Actor type "${type}" is already registered`)
    }
    configs.set(type, config)
  }

  function registerProvider(provider: ActorProvider): void {
    if (frozen) {
      throw new Error(`Cannot register provider for "${provider.type}" — registry is frozen`)
    }
    if (providers.has(provider.type)) {
      throw new Error(`Provider for actor type "${provider.type}" is already registered`)
    }
    providers.set(provider.type, provider)
  }

  function actorRestrictionConfig(type: string): ActorConfig {
    return configs.get(type) ?? DEFAULT_RESTRICTION_CONFIG
  }

  function isMethodAllowedForActor(type: string, method: AuthMethod): boolean {
    const config = actorRestrictionConfig(type)
    return config.allowedMethods.includes(method)
  }

  async function hasActorType(userId: string, type: string): Promise<boolean> {
    const provider = providers.get(type)
    if (!provider) {
      return false
    }
    return provider.hasActorType(userId)
  }

  function registeredActors(): string[] {
    return [...configs.keys()]
  }

  function freeze(): void {
    frozen = true
  }

  function isFrozen(): boolean {
    return frozen
  }

  return {
    registerActor,
    registerProvider,
    actorRestrictionConfig,
    isMethodAllowedForActor,
    hasActorType,
    registeredActors,
    freeze,
    isFrozen,
  }
}

// ─── Singleton ────────────────────────────────────────────────────────

export function useAuthActorService(): AuthActorService {
  return ((useAuthActorService as any).__instance__ ??= createAuthActorService())
}
