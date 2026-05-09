import type { Effect } from 'effect'
import { Cause, Effect as Eff, Exit } from 'effect'

/**
 * Assert that an Effect fails with an instance of the given tagged-error class
 * and return that instance for further assertions on its fields.
 *
 * The Effect must be fully provided (`R = never`) — call `Effect.provide(layer)`
 * before passing it in. Throws a descriptive Error on success, on a different
 * tag, or on an unexpected defect.
 */
export async function expectFailure<A, E, T extends E>(
  effect: Effect.Effect<A, E, never>,
  Tag: { new (...args: any[]): T },
): Promise<T> {
  const exit = await Eff.runPromiseExit(effect)
  if (Exit.isSuccess(exit)) {
    throw new Error(`Expected failure ${Tag.name}, got success: ${JSON.stringify(exit.value)}`)
  }
  const failure = Cause.failureOption(exit.cause)
  if (failure._tag === 'None') {
    throw new Error(`Expected failure ${Tag.name}, got defect: ${Cause.pretty(exit.cause)}`)
  }
  if (!(failure.value instanceof Tag)) {
    const tag = (failure.value as { _tag?: string })._tag ?? String(failure.value)
    throw new Error(`Expected ${Tag.name}, got ${tag}`)
  }
  return failure.value
}

/**
 * Assert that an Effect succeeds and return its value.
 *
 * The Effect must be fully provided (`R = never`) — call `Effect.provide(layer)`
 * before passing it in. Throws a descriptive Error if the Effect fails or dies.
 */
export async function expectSuccess<A, E>(
  effect: Effect.Effect<A, E, never>,
): Promise<A> {
  const exit = await Eff.runPromiseExit(effect)
  if (Exit.isFailure(exit)) {
    throw new Error(`Expected success, got: ${Cause.pretty(exit.cause)}`)
  }
  return exit.value
}
