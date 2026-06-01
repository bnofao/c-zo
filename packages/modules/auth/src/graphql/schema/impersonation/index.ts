import { registerImpersonationErrors } from './errors'
import { registerImpersonationMutations } from './mutations'

export { registerImpersonationErrors } from './errors'
export { registerImpersonationMutations } from './mutations'

// `builder: any` mirrors the existing dispatcher pattern at `schema/index.ts` —
// the outer registry type is wider than `AuthGraphQLSchemaBuilder` and the
// individual registrars narrow it on entry. Tightening here re-surfaces the
// generic mismatch flagged in earlier sprints.
export function registerImpersonationSchema(builder: any): void {
  registerImpersonationErrors(builder)
  registerImpersonationMutations(builder)
}
