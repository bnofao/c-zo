import { expect, it } from '@effect/vitest'
import { Duration, Effect, Exit, Fiber } from 'effect'
import { TestClock } from 'effect/testing'
import { constantTime } from './constant-time'

it.effect('pads a fast success up to the budget', () =>
  Effect.gen(function* () {
    const fiber = yield* Effect.forkChild(constantTime(Duration.millis(250), Effect.succeed('ok')))
    yield* TestClock.adjust(Duration.millis(249))
    const before = fiber.pollUnsafe()
    expect(before).toBeUndefined()
    yield* TestClock.adjust(Duration.millis(1))
    expect(yield* Fiber.join(fiber)).toBe('ok')
  }))

it.effect('pads a failure up to the budget and preserves the error', () =>
  Effect.gen(function* () {
    const fiber = yield* Effect.forkChild(
      constantTime(Duration.millis(100), Effect.fail('boom' as const)).pipe(Effect.exit),
    )
    yield* TestClock.adjust(Duration.millis(100))
    const exit = yield* Fiber.join(fiber)
    expect(Exit.isFailure(exit)).toBe(true)
  }))
