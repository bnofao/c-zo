import { existsSync } from 'node:fs'
import process from 'node:process'
import { createJiti } from 'jiti'
import { join, resolve } from 'pathe'

export interface DiscoverSchemasOptions {
  cwd?: string
}

/**
 * Discover database schemas from modules registered in a Nitro config file.
 *
 * Loads the config via jiti (sync), filters string-based modules (e.g. '@czo/auth'),
 * and looks for `dist/database/schema.js` in each module's node_modules directory.
 */
export function discoverModuleSchemas(
  configPath: string,
  options?: DiscoverSchemasOptions,
): string[] {
  const cwd = options?.cwd ?? process.cwd()
  const fullConfigPath = resolve(cwd, configPath)

  const jiti = createJiti(fullConfigPath)
  const config = jiti(fullConfigPath) as { modules?: unknown[] }

  const moduleNames = (config.modules ?? []).filter(
    (m): m is string => typeof m === 'string',
  )

  const schemas: string[] = []

  const extensions = ['.mjs', '.js']

  for (const name of moduleNames) {
    const moduleBase = join(cwd, 'node_modules', name, 'dist/database/schema')
    const match = extensions.find(ext => existsSync(moduleBase + ext))
    if (match) {
      schemas.push(moduleBase + match)
    }
  }

  return schemas
}
