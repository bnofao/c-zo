export class DatabaseError extends Error {
  constructor(
    message: string,
    public readonly fieldErrors?: Record<string, string[] | undefined>,
  ) {
    super(message)
    this.name = 'DatabaseError'
  }
}

export class OptimisticLockError extends Error {
  constructor(
    public readonly entityId: number | string,
    public readonly expectedVersion: number,
    public readonly actualVersion: number | null,
  ) {
    super(
      `Optimistic lock failed: entity ${entityId} expected version ${expectedVersion}, `
      + `but found ${actualVersion === null ? 'deleted record' : `version ${actualVersion}`}`,
    )
    this.name = 'OptimisticLockError'
  }
}

/**
 * Unwrap a (possibly multiply-wrapped) DB failure to its root driver error and
 * format the parts that matter for diagnosis: `<SQLSTATE> <message> (<detail>)`.
 *
 * Drizzle wraps the Postgres error in `EffectDrizzleQueryError`, whose `message`
 * only echoes the SQL + params (`"Failed query: …"`) — the real reason (the
 * Postgres `code`/`message`/`detail`) lives on the nested `.cause`. Domain
 * `dbErr` helpers then wrap THAT in a tagged error with its own `cause`. This
 * walks the whole `.cause` chain to the leaf and surfaces it on one line, so a
 * failure logs *why* instead of just re-printing the query.
 */
export function describeDbError(err: unknown): string {
  let current: unknown = err
  const seen = new Set<unknown>()
  while (
    current
    && typeof current === 'object'
    && !seen.has(current)
    && (current as { cause?: unknown }).cause != null
  ) {
    seen.add(current)
    current = (current as { cause?: unknown }).cause
  }
  const leaf = (current ?? err) as { code?: unknown, message?: unknown, detail?: unknown }
  const code = typeof leaf?.code === 'string' ? leaf.code : undefined
  const message = typeof leaf?.message === 'string' ? leaf.message : String(current)
  const detail = typeof leaf?.detail === 'string' ? leaf.detail : undefined
  return [code, message, detail ? `(${detail})` : undefined].filter(Boolean).join(' ')
}

export function toDatabaseError(err: unknown): never {
  if (err instanceof DatabaseError)
    throw err
  if (err instanceof Error && 'code' in err) {
    const pgCode = (err as { code: unknown }).code
    if (pgCode === '23505') {
      const detail = (err as { detail?: unknown }).detail
      const match = typeof detail === 'string' ? detail.match(/Key \((\w+)\)=/) : null
      const field = match?.[1]
      throw new DatabaseError(
        'Unique constraint violated',
        field ? { [field]: ['must be unique'] } : undefined,
      )
    }
    if (pgCode === '23503') {
      throw new DatabaseError('Foreign key constraint violated')
    }
  }
  throw err
}
