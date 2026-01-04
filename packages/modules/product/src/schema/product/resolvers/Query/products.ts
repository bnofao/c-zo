import type { QueryResolvers } from '../../../types.generated'

export const products: NonNullable<QueryResolvers['products']> = async (
  _parent,
  args,
  context
) => {
  const result = await context.services.product.listProducts({
    filter: args.filter ? {
      status: args.filter.status?.toLowerCase() as any,
      collectionId: args.filter.collectionId || undefined,
      typeId: args.filter.typeId || undefined,
      isGiftcard: args.filter.isGiftcard || undefined,
      discountable: args.filter.discountable || undefined,
      search: args.filter.search || undefined,
    } : undefined,
    sort: args.sort ? {
      field: args.sort.field,
      direction: args.sort.direction || 'ASC',
    } : undefined,
    pagination: args.pagination ? {
      limit: args.pagination.limit || 50,
      offset: args.pagination.offset || 0,
    } : undefined,
  })

  return {
    nodes: result.nodes,
    pageInfo: {
      hasNextPage: result.pageInfo.hasNextPage,
      hasPreviousPage: result.pageInfo.hasPreviousPage,
      startCursor: result.nodes[0]?.id || null,
      endCursor: result.nodes[result.nodes.length - 1]?.id || null,
    },
    totalCount: result.totalCount,
  }
}
