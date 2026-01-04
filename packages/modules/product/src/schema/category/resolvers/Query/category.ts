import type { QueryResolvers } from '../../../types.generated'

export const category: NonNullable<QueryResolvers['category']> = async (
  _parent,
  { id },
  context
) => {
  const categoryService = await useContainer().make('categoryService')
  const category = await categoryService.getCategory(id)
  return category
}

