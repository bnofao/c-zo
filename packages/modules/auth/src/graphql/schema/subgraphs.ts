import type { SubGraphName } from '@czo/kit/graphql'

/**
 * Expand one audience (one or more sub-graph names) into the option fragments a
 * `relayMutationField` needs. Spread `field`/`input`/`payload` into the 3rd/2nd/4th
 * args and merge `errorOpts` into the field's `errors` option:
 *
 *   const A = sg('admin')
 *   builder.relayMutationField('x',
 *     { ...A.input, inputFields },
 *     { ...A.field, errors: { types: [...], ...A.errorOpts }, resolve },
 *     { ...A.payload, outputFields })
 */
export function sg(...names: SubGraphName[]) {
  const subGraphs = names
  return {
    field: { subGraphs },
    input: { subGraphs },
    payload: { subGraphs },
    errorOpts: { union: { subGraphs }, result: { subGraphs } },
  } as const
}
