import { createRequire } from 'node:module'
import process from 'node:process'
import { join } from 'pathe'

export interface DiscoverSchemasOptions {
  /** Directory whose `node_modules` the specifiers resolve against. Default `process.cwd()`. */
  cwd?: string
  /** Package export subpath probed for each module's Drizzle schema. Default `'schema'`. */
  schemaExport?: string
}

/**
 * Resolve the Drizzle schema file of each listed module, for drizzle-kit.
 *
 * Takes the module specifiers an app lists in its manifest (e.g.
 * `['@czo/auth/module']`), derives each one's package name, and resolves that
 * package's `./schema` export through Node resolution — honoring the package
 * `exports` map instead of hard-coding a `dist/...` path. Modules whose package
 * exposes no `./schema` export are skipped (they contribute no tables).
 *
 * Resolution targets the package's published entry (its `default` condition,
 * i.e. the built `dist`), so the listed modules must be built before generating
 * migrations — same precondition as before.
 *
 * @example
 * // apps/<app>/drizzle.config.ts
 * export default defineConfig({
 *   schema: discoverModuleSchemas(['@czo/auth/module']),
 *   // …
 * })
 */
export function discoverModuleSchemas(
  modules: string[],
  options?: DiscoverSchemasOptions,
): string[] {
  const cwd = options?.cwd ?? process.cwd()
  const schemaExport = options?.schemaExport ?? 'schema'
  // Resolve relative to the app's node_modules, not this file's location.
  const require = createRequire(join(cwd, 'package.json'))

  const schemas: string[] = []
  for (const specifier of modules) {
    const pkg = packageNameOf(specifier)
    try {
      schemas.push(require.resolve(`${pkg}/${schemaExport}`))
    }
    catch {
      // Package exposes no `./schema` export — nothing to migrate for it.
    }
  }
  return schemas
}

/** Strip any export subpath: `@scope/name/sub` → `@scope/name`; `name/sub` → `name`. */
function packageNameOf(specifier: string): string {
  const segments = specifier.split('/')
  return specifier.startsWith('@') ? segments.slice(0, 2).join('/') : (segments[0] ?? specifier)
}
