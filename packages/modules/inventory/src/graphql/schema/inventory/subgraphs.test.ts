import { describe, expect, it } from 'vitest'
import { sg } from './subgraphs'

describe('sg() audience helper', () => {
  it('expands an audience into the four relayMutationField option fragments', () => {
    const O = sg('org')
    expect(O.field).toEqual({ subGraphs: ['org'] })
    expect(O.input).toEqual({ subGraphs: ['org'] })
    expect(O.payload).toEqual({ subGraphs: ['org'] })
    expect(O.errorOpts).toEqual({ union: { subGraphs: ['org'] }, result: { subGraphs: ['org'] } })
  })
})
