/**
 * Module manifest for the life app.
 *
 * Every module is listed explicitly here. `composeApp(modules)` in
 * `main.ts` consumes this list to aggregate DB schemas, GraphQL
 * contributions, Effect Layers, and lifecycle hooks.
 */
import type { CzoModule } from '@czo/kit/module'
import { makeAuthModule } from '@czo/auth/module'

export interface LifeConfig {
  readonly app: string
  readonly baseUrl?: string
  readonly auth: {
    readonly secret: string
  }
}

export function makeModules(config: LifeConfig): ReadonlyArray<CzoModule> {
  return [
    makeAuthModule({
      app: config.app,
      secret: config.auth.secret,
      baseUrl: config.baseUrl,
    }),
  ]
}
