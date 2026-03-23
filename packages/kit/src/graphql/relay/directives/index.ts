import { registerDirective } from '../../directives'
import { connectionDirective } from './connection'
import { globalIdDirective } from './global-id'
import { relayMutationDirective } from './relay-mutation'

registerDirective(globalIdDirective)
registerDirective(connectionDirective)
registerDirective(relayMutationDirective)
