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

export function toDatabaseError(err: unknown): never {
  if (err instanceof DatabaseError) throw err
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
