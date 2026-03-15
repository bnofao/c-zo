import { registerContextFactory } from '@czo/kit/graphql'
import { useContainer } from '@czo/kit/ioc'
import '../types'

registerContextFactory('stockLocation', async () => {
  const container = useContainer()

  return {
    stockLocation: {
      service: await container.make('stockLocation:service'),
    },
  }
})
