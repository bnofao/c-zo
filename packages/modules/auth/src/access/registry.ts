import type { AccessRole, AccessStatementProvider, Statements } from './types'

// ─── Registry ────────────────────────────────────────────────────────

export class AccessStatementRegistry {
  private readonly providers = new Map<string, AccessStatementProvider>()
  private frozen = false

  registerStatements<S extends Statements, R extends string>(
    provider: AccessStatementProvider<S, R>,
  ): void {
    if (this.frozen) {
      throw new Error(`Cannot register statements "${provider.name}" — registry is frozen`)
    }
    if (this.providers.has(provider.name)) {
      throw new Error(`Statement provider "${provider.name}" is already registered`)
    }
    this.providers.set(provider.name, provider as AccessStatementProvider)
  }

  getProviders(): AccessStatementProvider[] {
    return [...this.providers.values()]
  }

  getRole(name: string): AccessRole | undefined {
    for (const provider of this.providers.values()) {
      if (name in provider.roles) {
        return provider.roles[name]
      }
    }
    return undefined
  }

  getRoleMap(): Record<string, AccessRole> {
    const roleMap: Record<string, AccessRole> = {}

    for (const provider of this.providers.values()) {
      for (const [roleName, role] of Object.entries(provider.roles)) {
        roleMap[roleName] = role
      }
    }

    return roleMap
  }

  freeze(): void {
    this.frozen = true
  }

  isFrozen(): boolean {
    return this.frozen
  }
}

// ─── Singleton ───────────────────────────────────────────────────────

export function useAccessStatementRegistry(): AccessStatementRegistry {
  return ((useAccessStatementRegistry as any).__instance__ ??= new AccessStatementRegistry())
}
