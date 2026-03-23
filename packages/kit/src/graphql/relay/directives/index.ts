import { registerDirective } from '../../directives'
import { globalIdDirective } from './global-id'
import { connectionDirective } from './connection'
import { relayMutationDirective } from './relay-mutation'

registerDirective(globalIdDirective)
registerDirective(connectionDirective)
registerDirective(relayMutationDirective)
