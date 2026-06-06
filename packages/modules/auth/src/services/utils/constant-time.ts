import { Clock, Duration, Effect } from 'effect'

/**
 * Pad an effect to a fixed wall-clock budget so its latency carries no signal
 * about which internal branch ran — defends the account-existence enumeration
 * vectors (`requestPasswordReset` / `requestEmailVerification` /
 * `requestEmailChange`). The effect runs to completion (success OR failure);
 * we then sleep the remainder of the budget before surfacing the result.
 * `Clock` + `Effect.sleep` make the timing `TestClock`-driven and deterministic.
 */
export function constantTime<A, E, R>(budget: Duration.Duration, self: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> {
  return Effect.gen(function* () {
    const start = yield* Clock.currentTimeMillis
    const exit = yield* Effect.exit(self)
    const elapsed = (yield* Clock.currentTimeMillis) - start
    const remaining = Duration.toMillis(budget) - elapsed
    if (remaining > 0)
      yield* Effect.sleep(Duration.millis(remaining))
    return yield* exit
  })
}
