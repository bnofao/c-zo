import { Data, Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import { expectFailure, expectSuccess } from './test'

class FooError extends Data.TaggedError('FooError')<{ readonly x: number }> {}
class BarError extends Data.TaggedError('BarError') {}

describe('expectFailure', () => {
  it('returns the failure value when tag matches', async () => {
    const err = await expectFailure(
      Effect.gen(function* () {
        return yield* new FooError({ x: 1 })
      }),
      FooError,
    )
    expect(err.x).toBe(1)
  })

  it('throws when the effect succeeds', async () => {
    await expect(
      expectFailure(Effect.succeed(1) as Effect.Effect<number, FooError>, FooError),
    ).rejects.toThrow(/Expected failure FooError/)
  })

  it('throws when a different tag is returned', async () => {
    const program: Effect.Effect<never, FooError | BarError> = Effect.gen(function* () {
      return yield* new BarError()
    })
    await expect(
      expectFailure(program, FooError),
    ).rejects.toThrow(/Expected FooError, got BarError/)
  })

  it('throws when the effect dies (defect, not a typed failure)', async () => {
    await expect(
      expectFailure(Effect.die('boom') as Effect.Effect<never, FooError>, FooError),
    ).rejects.toThrow(/got defect/)
  })
})

describe('expectSuccess', () => {
  it('returns the success value', async () => {
    await expect(expectSuccess(Effect.succeed('ok'))).resolves.toBe('ok')
  })

  it('throws when the effect fails', async () => {
    await expect(
      expectSuccess(Effect.gen(function* () {
        return yield* new FooError({ x: 0 })
      })),
    ).rejects.toThrow(/Expected success/)
  })
})
