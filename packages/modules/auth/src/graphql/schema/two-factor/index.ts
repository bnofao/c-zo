import { registerTwoFactorErrors } from './errors'
import { registerTwoFactorInputs } from './inputs'
import { registerTwoFactorMutations } from './mutations'
import { registerTwoFactorQueries } from './queries'

// Note: two-factor has no registerTypes (no drizzleNode)
export function registerTwoFactorSchema(builder: any): void {
  registerTwoFactorErrors(builder)
  registerTwoFactorInputs(builder)
  registerTwoFactorQueries(builder)
  registerTwoFactorMutations(builder)
}
