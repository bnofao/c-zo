import type { FieldNode, SelectionSetNode } from 'graphql'
import { Kind, parse } from 'graphql'

/**
 * Filters a payload object to include only the fields requested
 * by a GraphQL subscription query.
 *
 * Given `subscription { event { id name } }` and `{ id: 1, name: "a", secret: "x" }`,
 * returns `{ id: 1, name: "a" }`.
 *
 * The function walks the first operation's root selection set.
 * If the root has a single field with a sub-selection (the typical
 * `subscription { event { ... } }` wrapper), it unwraps into that
 * sub-selection so the filter applies to the actual payload shape.
 *
 * Returns the original payload when no meaningful selection can be extracted.
 */
export function pickFieldsFromQuery(query: string, payload: unknown): unknown {
  if (payload === null || payload === undefined || typeof payload !== 'object') {
    return payload
  }

  const doc = parse(query)
  const operation = doc.definitions.find(d => d.kind === Kind.OPERATION_DEFINITION)

  if (!operation || operation.kind !== Kind.OPERATION_DEFINITION) {
    return payload
  }

  let selectionSet = operation.selectionSet

  // Unwrap the conventional `subscription { event { ... } }` wrapper:
  // if the root has exactly one field with its own sub-selection, use that.
  const rootFields = selectionSet.selections.filter(
    (s): s is FieldNode => s.kind === Kind.FIELD,
  )
  if (rootFields.length === 1 && rootFields[0]!.selectionSet) {
    selectionSet = rootFields[0]!.selectionSet
  }

  return pickFromSelectionSet(selectionSet, payload as Record<string, unknown>)
}

function pickFromSelectionSet(
  selectionSet: SelectionSetNode,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const selection of selectionSet.selections) {
    if (selection.kind !== Kind.FIELD)
      continue

    const fieldName = selection.name.value
    const value = source[fieldName]

    if (value === undefined)
      continue

    if (selection.selectionSet && value !== null && typeof value === 'object') {
      if (Array.isArray(value)) {
        result[fieldName] = value.map(item =>
          typeof item === 'object' && item !== null
            ? pickFromSelectionSet(selection.selectionSet!, item as Record<string, unknown>)
            : item,
        )
      }
      else {
        result[fieldName] = pickFromSelectionSet(
          selection.selectionSet,
          value as Record<string, unknown>,
        )
      }
    }
    else {
      result[fieldName] = value
    }
  }

  return result
}
