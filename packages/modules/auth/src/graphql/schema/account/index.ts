import { registerAccountErrors } from './errors'
import { registerAccountInputs } from './inputs'
import { registerAccountMutations } from './mutations'
import { registerAccountQueries } from './queries'
import { registerAccountTypes } from './types'

export function registerAccountSchema(builder: any): void {
  registerAccountErrors(builder)
  registerAccountTypes(builder)
  registerAccountInputs(builder)
  registerAccountQueries(builder)
  registerAccountMutations(builder)
}
