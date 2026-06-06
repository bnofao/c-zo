import type { ChannelGraphQLSchemaBuilder } from '@czo/channel/graphql'
import { registerChannelErrors } from './channel/errors'
import { registerChannelInputs } from './channel/inputs'
import { registerChannelMutations } from './channel/mutations'
import { registerChannelQueries } from './channel/queries'
import { registerChannelTypes } from './channel/types'

// Builder alias re-exported so consumers can reference the phantom-typed
// builder by its scoped name without reaching into `graphql/index.ts`.
export type ChannelBuilder = ChannelGraphQLSchemaBuilder

export function registerChannelSchema(builder: ChannelBuilder): void {
  registerChannelTypes(builder)
  registerChannelErrors(builder)
  registerChannelInputs(builder)
  registerChannelQueries(builder)
  registerChannelMutations(builder)
}
