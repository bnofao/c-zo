import type { QueryResolvers } from '../../../types.generated'
import { buildCategoryTree } from '@czo/product/utils'

export const categoryTree: NonNullable<QueryResolvers['categoryTree']> = async (
  _parent,
  { rootCategoryId },
  context
) => {
  const categoryService = await useContainer().make('categoryService')
  const categories = await categoryService.getCategoryTree(
    rootCategoryId || undefined
  )

  // Build tree structure
  const tree = buildCategoryTree(categories)

  // Convert to CategoryNode format with depth
  function toCategoryNode(category: any, depth: number = 0): any {
    return {
      category,
      children: category.children.map((child: any) => toCategoryNode(child, depth + 1)),
      depth,
    }
  }

  return tree.map(cat => toCategoryNode(cat, 0))
}

