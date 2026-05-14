import { registerApiKeyErrors } from './errors'
import { registerApiKeyInputs } from './inputs'
import { registerApiKeyMutations } from './mutations'
import { registerApiKeyQueries } from './queries'
import { registerApiKeyTypes } from './types'

export function registerApiKeySchema(builder: any): void {
  registerApiKeyErrors(builder)
  registerApiKeyTypes(builder)
  registerApiKeyInputs(builder)
  registerApiKeyQueries(builder)
  registerApiKeyMutations(builder)
}
