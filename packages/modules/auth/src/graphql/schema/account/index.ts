import { registerAccountErrors } from './errors'
import { registerAccountMutations } from './mutations'

export { registerAccountErrors } from './errors'
export { registerAccountMutations } from './mutations'

// `builder: any` mirrors the existing dispatcher pattern at `schema/index.ts` —
// the outer registry type is wider than `AuthGraphQLSchemaBuilder` and the
// individual registrars narrow it on entry. Same convention as SP4b
// `registerImpersonationSchema`.
export function registerAccountSchema(builder: any): void {
  registerAccountErrors(builder)
  registerAccountMutations(builder)
}
