/**
 * Module manifest for the mazo app.
 *
 * Every module is listed explicitly here. `composeApp(modules)` in
 * `server.ts` consumes this list to aggregate DB schemas, GraphQL
 * contributions, Effect Layers, and lifecycle hooks.
 *
 * When phase 3 lands (drop Nitro, custom main entry), this file
 * remains the single source of truth — only the consumer changes.
 *
 * Future: a codegen script can emit a `modules.generated.ts` from the
 * `czo.module: true` field in each workspace package.json. Not needed
 * while the list is short.
 */
import type { CzoModule } from '@czo/kit/module'
import { makeAuthModule } from '@czo/auth/module'

export interface MazoConfig {
  readonly app: string
  readonly baseUrl?: string
  readonly auth: {
    readonly secret: string
    readonly socials?: never
  }
}

export function makeModules(config: MazoConfig): ReadonlyArray<CzoModule> {
  return [
    makeAuthModule({
      app: config.app,
      secret: config.auth.secret,
      baseUrl: config.baseUrl,
      socials: config.auth.socials,
    }),
  ]
}
