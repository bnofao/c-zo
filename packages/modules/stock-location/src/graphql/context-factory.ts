import { registerContextFactory } from '@czo/kit/graphql'
import { useContainer } from '@czo/kit/ioc'
import '../types'

registerContextFactory('stockLocation', async () => {
  const container = useContainer()
  const service = await container.make('stockLocation:service')

  return {
    stockLocation: { service },
  }
})
