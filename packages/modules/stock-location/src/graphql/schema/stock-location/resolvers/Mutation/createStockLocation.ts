import type { MutationResolvers } from './../../../../__generated__/types.generated'
import { useDatabase } from '@czo/kit/db'
import { fromGlobalId, withPaylaod } from '@czo/kit/graphql'

export const createStockLocation: NonNullable<MutationResolvers['createStockLocation']> = async (_parent, _arg, _ctx) => {
  const { address: _address, ..._location } = _arg.input

  return await withPaylaod({
    key: 'app',
    func: async () => {
      const db = await useDatabase()
      return await db.transaction(async (tx) => {
        const { organization, ...location } = _location
        const stockLocation = (await _ctx.stockLocation.service.create({
          ...location as any,
          organizationId: fromGlobalId(organization).id,
        }, { tx: tx as any }))[0]

        if (!stockLocation) {
          throw new Error('Failed to create stock location')
        }

        if (_address) {
          const addresses = await _ctx.stockLocation.addressService.create({
            stockLocationId: stockLocation.id as number,
            ..._address,
          })

          return {
            ...stockLocation,
            address: addresses[0],
          }
        }

        return {
          ...(stockLocation ?? {}),
          address: null,
        }
      })
    },
  })
}
