import { describe, expect, it } from 'vitest'
import { unadoptJobId } from './unadopt-queue'

describe('unadoptJobId', () => {
  it('produces distinct ids for two cycles with the same product+org but different adoptionId', () => {
    const cycle1 = unadoptJobId({ productId: 42, orgId: 7, adoptionId: 100 })
    const cycle2 = unadoptJobId({ productId: 42, orgId: 7, adoptionId: 101 })
    expect(cycle1).not.toBe(cycle2)
  })

  it('encodes all three discriminators in the returned string', () => {
    const id = unadoptJobId({ productId: 1, orgId: 2, adoptionId: 3 })
    expect(id).toBe('unadopt:1:2:3')
  })
})
