import type { IDFilter } from '@czo/kit/graphql'
import type { ProductWhereInput } from '@czo/product/graphql'

// IDFilter.eq/in/notIn are the honest decoded `{ typename, id }` shape (GlobalIDValue).
function intFilterFromID(f: IDFilter): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (f.eq != null)
    out.eq = Number(f.eq.id)
  if (f.in != null)
    out.in = f.in.map(v => Number(v.id))
  if (f.notIn != null)
    out.notIn = f.notIn.map(v => Number(v.id))
  return out
}

/**
 * Translate a `ProductWhereInput` (GraphQL) into a Drizzle RQBv2 `where`.
 * StringFilters pass through (their operator names already match RQBv2);
 * IDFilters decode their relay globalIDs to ints and map to the FK column
 * (`productType`) or a relational exists (`categories`/`collections`);
 * AND/OR/NOT recurse. Field filters are AND-combined.
 *
 * Note: `IDFilterInput` is a shared kit type with no `for:` node constraint, so
 * the relay `typename` is not validated; we use only `Number(v.id)`. A mismatched
 * node id just filters against the (correctly scoped) target column — no leak.
 */
export function buildProductWhere(input: ProductWhereInput): Record<string, unknown> {
  const clauses: Record<string, unknown>[] = []

  if (input.name != null)
    clauses.push({ name: input.name })
  if (input.handle != null)
    clauses.push({ handle: input.handle })
  if (input.productType != null)
    clauses.push({ productTypeId: intFilterFromID(input.productType) })
  if (input.categories != null)
    clauses.push({ categories: { categoryId: intFilterFromID(input.categories) } })
  if (input.collections != null)
    clauses.push({ collections: { collectionId: intFilterFromID(input.collections) } })
  if (input.AND != null)
    clauses.push({ AND: input.AND.map(p => buildProductWhere(p)) })
  if (input.OR != null)
    clauses.push({ OR: input.OR.map(p => buildProductWhere(p)) })
  if (input.NOT != null)
    clauses.push({ NOT: buildProductWhere(input.NOT) })

  if (clauses.length === 1)
    return clauses[0]!
  if (clauses.length > 1)
    return { AND: clauses }
  return {}
}
