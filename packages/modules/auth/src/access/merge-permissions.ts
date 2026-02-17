import type { Statements } from './types'

export function mergePermissions<S extends Statements>(
  base: Partial<{ [K in keyof S]: S[K][number][] }>,
  additions: Partial<{ [K in keyof S]: S[K][number][] }>,
): { [K in keyof S]?: S[K][number][] } {
  const allKeys = new Set([
    ...Object.keys(base),
    ...Object.keys(additions),
  ])

  const merged: Record<string, string[]> = {}

  for (const key of allKeys) {
    const baseActions = (base as Record<string, string[]>)[key] ?? []
    const addActions = (additions as Record<string, string[]>)[key] ?? []
    merged[key] = [...new Set([...baseActions, ...addActions])]
  }

  return merged as { [K in keyof S]?: S[K][number][] }
}
