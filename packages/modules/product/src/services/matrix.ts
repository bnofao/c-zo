// ─── Pure matrix helper — no Effect ──────────────────────────────────────────

export interface SelectionPair {
  readonly attributeId: number
  readonly valueId: number
}

/**
 * Compute a stable, order-independent key for a variant attribute-value
 * selection. Two selections that contain the same (attributeId, valueId) pairs
 * in any order will produce the same key.
 */
export function variantSelectionKey(pairs: ReadonlyArray<SelectionPair>): string {
  return [...pairs].map(p => `${p.attributeId}:${p.valueId}`).sort().join('|')
}

/**
 * Returns true when `candidate` is already represented in `existing` (i.e. a
 * variant with the same attribute-value combination already exists on the
 * product).
 */
export function isDuplicateMatrix(
  existing: ReadonlyArray<ReadonlyArray<SelectionPair>>,
  candidate: ReadonlyArray<SelectionPair>,
): boolean {
  const key = variantSelectionKey(candidate)
  return existing.some(combo => variantSelectionKey(combo) === key)
}
