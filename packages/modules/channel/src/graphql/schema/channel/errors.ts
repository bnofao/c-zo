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
  registerError(builder, ChannelNotFound, { name: 'ChannelNotFoundError' })
  registerError(builder, ChannelHandleTaken, {
    name: 'ChannelHandleTakenError',
    fields: t => ({ handle: t.exposeString('handle') }),
  })
  registerError(builder, CrossOrgStockLocation, {
    name: 'CrossOrgStockLocationError',
    fields: t => ({
      channelId: t.exposeInt('channelId'),
      stockLocationId: t.exposeInt('stockLocationId'),
    }),
  })
}
