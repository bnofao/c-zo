import { registerUserErrors } from './errors'
import { registerUserInputs } from './inputs'
import { registerUserMutations } from './mutations'
import { registerUserQueries } from './queries'
import { registerUserTypes } from './types'

export function registerUserSchema(builder: any): void {
  registerUserErrors(builder)
  registerUserTypes(builder)
  registerUserInputs(builder)
  registerUserQueries(builder)
  registerUserMutations(builder)
}
