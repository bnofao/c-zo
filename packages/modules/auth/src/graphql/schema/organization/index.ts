import { registerOrganizationErrors } from './errors'
import { registerOrganizationInputs } from './inputs'
import { registerOrganizationMutations } from './mutations'
import { registerOrganizationQueries } from './queries'
import { registerOrganizationTypes } from './types'

export function registerOrganizationSchema(builder: any): void {
  registerOrganizationErrors(builder)
  registerOrganizationTypes(builder)
  registerOrganizationInputs(builder)
  registerOrganizationQueries(builder)
  registerOrganizationMutations(builder)
}
