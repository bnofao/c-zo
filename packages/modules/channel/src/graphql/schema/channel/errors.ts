import type { ChannelGraphQLSchemaBuilder } from '@czo/channel/graphql'
import { registerError } from '@czo/kit/graphql'
import {
  ChannelHandleTaken,
  ChannelNotFound,
  CrossOrgStockLocation,
} from '../../../services/channel'

export {
  ChannelHandleTaken,
  ChannelNotFound,
  CrossOrgStockLocation,
}

export function registerChannelErrors(builder: ChannelGraphQLSchemaBuilder): void {
  registerError(builder, ChannelNotFound, { name: 'ChannelNotFoundError', subGraphs: ['org', 'admin'] })
  registerError(builder, ChannelHandleTaken, {
    name: 'ChannelHandleTakenError',
    subGraphs: ['org', 'admin'],
    fields: t => ({ handle: t.exposeString('handle') }),
  })
  registerError(builder, CrossOrgStockLocation, {
    name: 'CrossOrgStockLocationError',
    subGraphs: ['org'],
    fields: t => ({
      channelId: t.exposeInt('channelId'),
      stockLocationId: t.exposeInt('stockLocationId'),
    }),
  })
}
