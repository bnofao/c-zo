import type { Effect, ManagedRuntime } from 'effect'
import { Cause, Exit } from 'effect'

let _runtime: ManagedRuntime.ManagedRuntime<never, never> | undefined

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
    throw new Error('Effect runtime not initialized — did the auth module plugin run czo:init?')
  }
  return _runtime
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
