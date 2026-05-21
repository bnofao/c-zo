import { useRuntime } from '@czo/kit/effect'
import { registerContextFactory } from '@czo/kit/graphql'
import '../types'

registerContextFactory('stockLocation', async () => ({
  stockLocation: { runtime: useRuntime() },
}))
