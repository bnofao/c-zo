import { Layer } from 'effect'
import * as Channel from './channel'
import * as ChannelEvents from './events/channel'

export { Channel, ChannelEvents }

/**
 * Composite layer for the whole channel module. `provideMerge` keeps
 * `ChannelEvents` visible at the runtime surface so external subscribers
 * can `yield* ChannelEvents` and call `.subscribe`.
 */
export const ChannelModuleLive = Channel.layer.pipe(
  Layer.provideMerge(ChannelEvents.layer),
)
