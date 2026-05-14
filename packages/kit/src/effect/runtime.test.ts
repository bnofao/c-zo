import { Context, Data, Effect, Layer, ManagedRuntime } from 'effect'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildEffectRuntime, clearEffectLayers, registerEffectLayer, runEffect, setRuntime, useRuntime } from './runtime'

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

class Greeter extends Context.Tag('test/Greeter')<Greeter, { readonly hello: () => string }>() {}
const GreeterLive = Layer.succeed(Greeter, Greeter.of({ hello: () => 'hi' }))

describe('effect layer registry', () => {
  beforeEach(() => {
    clearEffectLayers()
    setRuntime(undefined)
  })

  it('does nothing and leaves the runtime uninitialized when no layers are registered', () => {
    buildEffectRuntime(Layer.empty)
    expect(() => useRuntime()).toThrow(/Effect runtime not initialized/)
  })

  it('builds a runtime that can resolve a registered layer', async () => {
    registerEffectLayer(GreeterLive)
    const rt = buildEffectRuntime(Layer.empty)
    expect(rt).toBeDefined()
    expect(useRuntime()).toBe(rt)
    const greeting = await runEffect(useRuntime(), Greeter.pipe(Effect.map(g => g.hello())))
    expect(greeting).toBe('hi')
  })

  it('provides the shared infra layer to registered layers', async () => {
    const EchoTag = Context.GenericTag<'test/Echo', { readonly echo: () => string }>('test/Echo')
    const NeedsGreeter = Layer.effect(
      EchoTag,
      Effect.gen(function* () {
        const g = yield* Greeter
        return { echo: () => `echo:${g.hello()}` }
      }),
    )
    registerEffectLayer(NeedsGreeter)
    buildEffectRuntime(GreeterLive)
    const out = await runEffect(useRuntime(), EchoTag.pipe(Effect.map(e => e.echo())))
    expect(out).toBe('echo:hi')
  })

  it('throws if a layer is registered after the runtime is built', () => {
    registerEffectLayer(GreeterLive)
    buildEffectRuntime(Layer.empty)
    expect(() => registerEffectLayer(GreeterLive)).toThrow(/already been built/)
  })

  it('clearEffectLayers resets the registry and frozen flag', () => {
    registerEffectLayer(GreeterLive)
    buildEffectRuntime(Layer.empty)
    clearEffectLayers()
    expect(() => registerEffectLayer(GreeterLive)).not.toThrow()
  })
})
