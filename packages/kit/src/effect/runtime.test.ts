import { Data, Effect, Layer, ManagedRuntime } from 'effect'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runEffect, setRuntime, useRuntime } from './runtime'

class SampleError extends Data.TaggedError('SampleError')<{ readonly reason: string }> {}

describe('runtime singleton', () => {
  beforeEach(() => {
    setRuntime(undefined)
  })

  it('throws a clear error when accessed before initialization', () => {
    expect(() => useRuntime()).toThrow(/Effect runtime not initialized/)
  })

  it('returns the runtime that was set', () => {
    const rt = ManagedRuntime.make(Layer.empty)
    setRuntime(rt)
    expect(useRuntime()).toBe(rt)
  })
})

describe('runEffect', () => {
  let rt: ManagedRuntime.ManagedRuntime<never, never>

  beforeEach(() => {
    rt = ManagedRuntime.make(Layer.empty)
  })
  afterEach(() => rt.dispose())

  it('resolves the success value', async () => {
    await expect(runEffect(rt, Effect.succeed(42))).resolves.toBe(42)
  })

  it('rejects with the original tagged error (not a FiberFailure)', async () => {
    const program = Effect.gen(function* () {
      return yield* new SampleError({ reason: 'nope' })
    })
    await expect(runEffect(rt, program)).rejects.toBeInstanceOf(SampleError)
  })

  it('rejects with the squashed cause for defects', async () => {
    const program = Effect.die('boom')
    await expect(runEffect(rt, program)).rejects.toBeDefined()
  })
})
