/**
 * Module manifest for the life app.
 *
 * Every module is listed explicitly here. `composeApp(modules)` in
 * `main.ts` consumes this list to aggregate DB schemas, GraphQL
 * contributions, Effect Layers, and lifecycle hooks.
 *
 * Modules read their own config from the environment via Effect `Config`,
 * so the manifest is a plain list — no per-module config is threaded here.
 */
import type { CzoModule } from '@czo/kit/module'
import authModule from '@czo/auth/module'

export const modules: ReadonlyArray<CzoModule> = [
  authModule,
]
