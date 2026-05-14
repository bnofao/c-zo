import { registerAppErrors } from './errors'
import { registerAppInputs } from './inputs'
import { registerAppMutations } from './mutations'
import { registerAppQueries } from './queries'
import { registerAppTypes } from './types'

export function registerAppSchema(builder: any): void {
  registerAppErrors(builder)
  registerAppTypes(builder)
  registerAppInputs(builder)
  registerAppQueries(builder)
  registerAppMutations(builder)
}
