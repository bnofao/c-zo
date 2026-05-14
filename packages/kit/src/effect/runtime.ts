import type { Effect } from 'effect'
import { Cause, Exit, Layer, ManagedRuntime } from 'effect'

let _runtime: ManagedRuntime.ManagedRuntime<never, never> | undefined

const _layers: Layer.Layer<never, unknown, unknown>[] = []
let _built = false

/**
 * Set the global Effect runtime. The type parameter `R` is intentionally erased
 * on storage: callers (e.g. GraphQL resolvers) treat the runtime as opaque and
 * rely on the Layer composed at boot to provide the services their Effects need.
 */
export function setRuntime<R>(rt: ManagedRuntime.ManagedRuntime<R, never> | undefined): void {
  _runtime = rt as ManagedRuntime.ManagedRuntime<never, never> | undefined
}

export function useRuntime(): ManagedRuntime.ManagedRuntime<never, never> {
  if (!_runtime) {
    throw new Error('Effect runtime not initialized — did the @czo/kit plugin build it after czo:boot?')
  }
  return _runtime
}

/**
 * Register a module's Layer to be merged into the single app-wide runtime.
 * Call this from a module's `czo:boot` hook. The Layer's requirements (`R`) may
 * be non-`never` as long as they are satisfied by the infra Layer passed to
 * `buildEffectRuntime` (currently `DrizzleDbLive`). Throws if called after the
 * runtime has already been built.
 */
export function registerEffectLayer<E, R>(layer: Layer.Layer<never, E, R>): void {
  if (_built) {
    throw new Error('Cannot register an Effect layer — the runtime has already been built')
  }
  _layers.push(layer as unknown as Layer.Layer<never, unknown, unknown>)
}

/** Test helper: drop all registered layers and reset the built flag. */
export function clearEffectLayers(): void {
  _layers.length = 0
  _built = false
}

/**
 * Build the single app-wide `ManagedRuntime` from every layer registered via
 * `registerEffectLayer`, providing `infra` (shared infrastructure layers, e.g.
 * `DrizzleDbLive`) exactly once. Stores the runtime via `setRuntime` and returns
 * it. If no layers were registered, does nothing and returns `undefined`
 * (`useRuntime()` then throws its "not initialized" error). Marks the registry
 * as built so late `registerEffectLayer` calls fail loudly.
 *
 * **Idempotent**: if a runtime already exists (e.g. Nitro hot-reload), it is
 * disposed before a new one is built. Subsequent `registerEffectLayer` calls
 * from the reloaded plugins target the same `_layers` array (callers should
 * `clearEffectLayers()` themselves before re-registering on reload).
 */
export function buildEffectRuntime<RIn>(
  infra: Layer.Layer<RIn, unknown, never>,
): ManagedRuntime.ManagedRuntime<never, never> | undefined {
  // Dispose any previous runtime so a hot-reload doesn't leak resources.
  if (_runtime) {
    void _runtime.dispose()
    _runtime = undefined
  }
  _built = true
  if (_layers.length === 0) {
    return undefined
  }
  const [first, ...rest] = _layers as [Layer.Layer<never, unknown, unknown>, ...Layer.Layer<never, unknown, unknown>[]]
  const merged = (rest.length === 0 ? first : Layer.mergeAll(first, ...rest))
    .pipe(Layer.provide(infra as Layer.Layer<RIn, unknown, never>))
  const rt = ManagedRuntime.make(merged as Layer.Layer<never, never, never>)
  setRuntime(rt)
  return rt
}

/**
 * Run an Effect against a ManagedRuntime, rejecting the returned Promise with
 * the original typed failure (not a FiberFailure) so Pothos's `errors: { types }`
 * plugin can match via instanceof. Defects are wrapped in an Error preserving
 * the original cause, so consumers always receive an Error instance.
 *
 * The Effect's `R` (requirements) is allowed to be non-`never`: the runtime is
 * intentionally typed as opaque (`<never, never>`) and we trust the Layer
 * composed at boot to provide the services the Effect needs. Internal cast.
 */
export async function runEffect<A, E, R = never>(
  rt: ManagedRuntime.ManagedRuntime<never, never>,
  effect: Effect.Effect<A, E, R>,
): Promise<A> {
  const exit = await rt.runPromiseExit(effect as Effect.Effect<A, E>)
  if (Exit.isSuccess(exit))
    return exit.value
  const failure = Cause.failureOption(exit.cause)
  if (failure._tag === 'Some')
    throw failure.value as Error
  throw new Error(`Effect defect: ${Cause.pretty(exit.cause)}`, { cause: Cause.squash(exit.cause) })
}
