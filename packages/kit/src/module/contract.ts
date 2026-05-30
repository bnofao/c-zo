/**
 * Module contract for the czo application framework.
 *
 * A `CzoModule` is the unit of composition: self-contained domain code
 * (services, GraphQL schema, DB schema, optional HTTP routes / workers /
 * lifecycle hooks) packaged into a value that the host app picks up and
 * passes to `composeApp([...modules])`.
 *
 * Design goals:
 * - **Effect-native**: a module IS a Layer plus declarative metadata. No
 *   imperative plugin lifecycle, no IoC container, no Nitro hooks.
 * - **Composable**: `composeApp` merges N modules into one app Layer +
 *   one Pothos schema + one DB schema, plus sequenced startup effects.
 * - **Static by default**: discovery is build-time codegen, not runtime
 *   scanning. The list of modules is explicit per app.
 *
 * This contract replaces the Nitro `definePlugin` + IoC registration
 * pattern. The legacy Nitro module export (`module/index.ts`) stays in
 * place during the transition; phase 3 will drop it entirely.
 */
import type { GraphQLContextMap, SchemaBuilder } from '@czo/kit/graphql'
import type { Effect, Layer } from 'effect'
import type { H3 } from 'h3'
import type { RelationsFactory } from '../db/schema-registry'
import type { SeederConfig } from '../db/seeder'
import type { ApiRoute } from '../openapi/route'

/* ─── Module ───────────────────────────────────────────────────────── */

export interface Module<Name extends string = string, R = never> {
  /** Stable identifier used for logs, span names, conflict detection. */
  readonly name: Name

  /** Semver string. Surfaces in `service.version` resource attribute. */
  readonly version: string

  /**
   * Primary Effect Layer for the module. Provides any Tags the module
   * exposes (services, event buses, etc.) and pulls in cross-module
   * dependencies via the standard Layer composition rules.
   *
   * `composeApp` mergeAll's every module's `layer` and provides shared
   * infra (`DrizzleDb`, OTel `Tracer`) once at the runtime surface.
   */
  readonly layer: Layer.Layer<R, never, never>

  /**
   * Database schema contribution. Tables are aggregated into a single
   * combined schema before `DrizzleDbLive` is constructed, so RQBv2
   * relation inference sees every module's tables. Relations are
   * applied via `defineRelationsPart` and merged across modules.
   *
   * Use `seeders` for drizzle-seed entries (dev/test fixtures).
   */
  readonly db?: {
    readonly schema: Record<string, unknown>
    readonly relations?: RelationsFactory
    readonly seeders?: ReadonlyArray<{ readonly name: string, readonly config: SeederConfig }>
  }

  /**
   * GraphQL contributions for the module.
   *
   *  - `contribution` — receives the shared Pothos `SchemaBuilder` and
   *    registers types/queries/mutations/inputs. Applied in module
   *    order before the schema is materialized.
   *  - `authScope` — receives the GraphQL context and returns the
   *    `authScopes` map merged into `scopeAuth.authScopes` at request
   *    time (used by `t.field({ authScopes: { … } })`).
   */
  readonly graphql?: {
    readonly contribution?: (builder: SchemaBuilder) => void
    readonly authScope?: (ctx: GraphQLContextMap) => Record<string, unknown>
    readonly contexts?: (systemContext: unknown) =>
    Effect.Effect<Partial<GraphQLContextMap>, unknown, any>
  }

  /**
   * HTTP contribution callback. Receives the host `H3` instance and
   * registers routes / middlewares / event hooks on it. Runs once at
   * boot, after the runtime is built but before `serve()`.
   *
   * Handlers themselves typically reach into the Effect runtime via
   * `useRuntime()` + `runEffect(...)` — the bootstrap effect itself
   * therefore needs no requirements (`R = never`).
   */
  readonly http?: (app: H3) => Effect.Effect<void, never, never>

  /**
   * Declarative REST routes. Each entry is registered on the host h3 app
   * AND aggregated into the OpenAPI document (when `buildApp({ openapi })`
   * is configured), keeping path/method/operation a single source of
   * truth. The imperative `http(app)` hook remains for non-REST needs
   * (middleware, catch-alls, proxying).
   */
  readonly routes?: readonly ApiRoute[]

  /**
   * Effect that runs once after the runtime is built but before the
   * server starts accepting traffic. Use for last-mile setup that
   * needs the runtime (e.g. `AccessService.freeze`, registry
   * finalization).
   */
  readonly onStart?: Effect.Effect<void, never, R>

  /**
   * Effect that runs during graceful shutdown, before the runtime is
   * disposed. Use to flush pending state, close subscriptions, etc.
   * Finalizers attached via `Effect.addFinalizer` inside the Layer
   * are still preferred — this hook is for ordering across modules.
   */
  readonly onStop?: Effect.Effect<void, never, R>
}

/* ─── Helper ───────────────────────────────────────────────────────── */

/**
 * Helper to define a `CzoModule` with type inference. Takes a thunk so a
 * module's imperative Layer construction (multiple `const`s, config reads,
 * validation) lives inline at the export site — no separately-named
 * `makeXModule` factory needed. The thunk is invoked immediately; `Layer`s
 * stay lazy descriptions, so there's no eager work at import time.
 *
 * @example
 * ```ts
 * export default defineModule(() => {
 *   const AuthModuleLive = Layer.mergeAll(...).pipe(Layer.provide(AuthModuleConfigLive))
 *   return {
 *     name: 'auth',
 *     version: '0.1.0',
 *     layer: AuthModuleLive,
 *     db: { schema: authSchema, relations: authRelations },
 *     graphql: { contribution: registerAuthSchema },
 *     onStart: AccessService.use((s) => s.freeze),
 *   }
 * })
 * ```
 */
export function defineModule<Name extends string, R>(
  module: () => Module<Name, R>,
): Module<Name, R> {
  return module()
}
