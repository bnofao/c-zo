import type { SubGraphName } from '@czo/kit/graphql'

/**
 * Expand one or more audiences into the option fragments a `relayMutationField`
 * needs. Spread `field`/`input`/`payload` into the 3rd/2nd/4th args and merge
 * `errorOpts` into the field's `errors` option (alongside `types`).
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
