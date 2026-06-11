import { describe, expect, it } from 'vitest'
import { sg } from './subgraphs'

describe('sg() audience helper', () => {
  it('expands one audience into the four relayMutationField option objects', () => {
    const A = sg('admin')
    expect(A.field).toEqual({ subGraphs: ['admin'] })
    expect(A.input).toEqual({ subGraphs: ['admin'] })
    expect(A.payload).toEqual({ subGraphs: ['admin'] })
    expect(A.errorOpts).toEqual({ union: { subGraphs: ['admin'] }, result: { subGraphs: ['admin'] } })
  })

  it('supports multi-membership', () => {
    expect(sg('account', 'org').field).toEqual({ subGraphs: ['account', 'org'] })
  })
})
