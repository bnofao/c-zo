import type { FunctionsVersioning } from 'drizzle-seed'

export type SeedRefineFuncs = FunctionsVersioning

export interface SeederConfig {
  dependsOn?: string[]
  refine: (f: SeedRefineFuncs) => Record<string, unknown>
}

const seeders = new Map<string, SeederConfig>()

export function registerSeeder(name: string, config: SeederConfig): void {
  if (seeders.has(name)) {
    throw new Error(`Seeder "${name}" is already registered`)
  }
  seeders.set(name, config)
}

export function registeredSeeders(): ReadonlyMap<string, SeederConfig> {
  return seeders
}

export function topologicalSort(only?: string[]): string[] {
  let entries = new Map(seeders)

  // Resolve transitive dependencies if only is provided
  if (only) {
    const resolved = new Set<string>()
    const queue = [...only]

    while (queue.length > 0) {
      const name = queue.pop()!
      if (resolved.has(name))
        continue
      resolved.add(name)

      const config = entries.get(name)
      if (!config) {
        throw new Error(`Unknown seeder dependency "${name}"`)
      }

      for (const dep of config.dependsOn ?? []) {
        queue.push(dep)
      }
    }

    entries = new Map([...entries].filter(([name]) => resolved.has(name)))
  }

  // Validate all dependsOn references exist
  for (const [name, config] of entries) {
    for (const dep of config.dependsOn ?? []) {
      if (!entries.has(dep)) {
        throw new Error(`Unknown seeder dependency "${dep}" referenced by "${name}"`)
      }
    }
  }

  // Kahn's algorithm
  const inDegree = new Map<string, number>()
  for (const name of entries.keys()) {
    inDegree.set(name, 0)
  }

  // Build adjacency list: edge from dep -> dependent
  const adjacency = new Map<string, string[]>()
  for (const name of entries.keys()) {
    adjacency.set(name, [])
  }

  for (const [name, config] of entries) {
    for (const dep of config.dependsOn ?? []) {
      adjacency.get(dep)!.push(name)
      inDegree.set(name, (inDegree.get(name) ?? 0) + 1)
    }
  }

  const queue: string[] = []
  for (const [name, degree] of inDegree) {
    if (degree === 0)
      queue.push(name)
  }

  const sorted: string[] = []

  while (queue.length > 0) {
    const name = queue.shift()!
    sorted.push(name)

    for (const dependent of adjacency.get(name) ?? []) {
      const newDegree = inDegree.get(dependent)! - 1
      inDegree.set(dependent, newDegree)
      if (newDegree === 0)
        queue.push(dependent)
    }
  }

  if (sorted.length !== entries.size) {
    throw new Error('Circular dependency detected in seeders')
  }

  return sorted
}

export interface RunSeederOptions {
  reset?: boolean
  only?: string[]
}

export async function runSeeder(opts?: RunSeederOptions): Promise<void> {
  const { useDatabase } = await import('./manager')
  const { registeredSchemas } = await import('./schema-registry')
  const { reset, seed } = await import('drizzle-seed')

  const db = await useDatabase()
  const schema = registeredSchemas()

  if (opts?.reset) {
    await reset(db, schema)
  }

  const sorted = topologicalSort(opts?.only)

  for (const name of sorted) {
    if (!(name in schema)) {
      throw new Error(`Seeder "${name}" does not match any table in the schema`)
    }
  }

  // Only pass tables that have registered seeders — drizzle-seed seeds ALL tables in the schema
  const filteredSchema = Object.fromEntries(
    Object.entries(schema).filter(([name]) => sorted.includes(name)),
  )

  await seed(db, filteredSchema).refine((f: any) => {
    const merged: Record<string, any> = {}
    for (const name of sorted) {
      const config = seeders.get(name)!
      merged[name] = config.refine(f)
    }
    return merged
  })
}
