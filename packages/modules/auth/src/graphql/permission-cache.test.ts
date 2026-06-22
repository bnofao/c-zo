import { describe, expect, it, vi } from 'vitest'
import { cachedPermission } from './permission-cache'

describe('cachedPermission', () => {
  it('computes once per (ctx, key) and reuses the result', async () => {
    const ctx = {}
    const compute = vi.fn(async () => true)
    const a = await cachedPermission(ctx, 'u1:7:product:read', compute)
    const b = await cachedPermission(ctx, 'u1:7:product:read', compute)
    expect(a).toBe(true)
    expect(b).toBe(true)
    expect(compute).toHaveBeenCalledTimes(1)
  })

  it('recomputes for a different key on the same ctx', async () => {
    const ctx = {}
    const compute = vi.fn(async () => false)
    await cachedPermission(ctx, 'u1:7:product:read', compute)
    await cachedPermission(ctx, 'u1:7:product:write', compute)
    expect(compute).toHaveBeenCalledTimes(2)
  })

  it('isolates per ctx (per-request): same key, different ctx → recompute', async () => {
    const compute = vi.fn(async () => true)
    await cachedPermission({}, 'u1:7:product:read', compute)
    await cachedPermission({}, 'u1:7:product:read', compute)
    expect(compute).toHaveBeenCalledTimes(2)
  })

  it('coalesces concurrent in-flight checks into a single compute', async () => {
    const ctx = {}
    let resolve!: (v: boolean) => void
    const compute = vi.fn(() => new Promise<boolean>((r) => {
      resolve = r
    }))
    const p1 = cachedPermission(ctx, 'u1:7:product:read', compute)
    const p2 = cachedPermission(ctx, 'u1:7:product:read', compute)
    resolve(true)
    expect(await p1).toBe(true)
    expect(await p2).toBe(true)
    expect(compute).toHaveBeenCalledTimes(1)
  })
})
