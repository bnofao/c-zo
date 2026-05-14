import { describe, expect, it, vi } from 'vitest'

function makeFakeNitro() {
  const listeners = new Map<string, Array<(...a: any[]) => unknown>>()
  return {
    container: undefined as unknown,
    hooks: {
      hook(name: string, fn: (...a: any[]) => unknown) {
        const arr = listeners.get(name) ?? []
        arr.push(fn)
        listeners.set(name, arr)
      },
      async callHook(name: string, ...args: any[]) {
        for (const fn of listeners.get(name) ?? []) await fn(...args)
      },
    },
  }
}

describe('@czo/kit plugin', () => {
  it('builds the Effect runtime after czo:boot and disposes it on close', async () => {
    vi.resetModules()
    const { registerEffectLayer, clearEffectLayers, useRuntime } = await import('../effect')
    const { Layer, Context } = await import('effect')
    clearEffectLayers()

    const Tag = Context.GenericTag<'test/Plugin', { readonly v: number }>('test/Plugin')
    const nitro = makeFakeNitro()
    nitro.hooks.hook('czo:boot', () => registerEffectLayer(Layer.succeed(Tag, { v: 7 })))

    const plugin = (await import('./index')).default
    plugin(nitro as any)

    // let the kit's async hook chain (init → register → boot → build) settle
    await new Promise(r => setTimeout(r, 0))
    await new Promise(r => setTimeout(r, 0))
    await new Promise(r => setTimeout(r, 0))

    const rt = useRuntime()
    expect(rt).toBeDefined()

    await nitro.hooks.callHook('close')
    clearEffectLayers()
  })
})
