/**
 * Error thrown when optimistic locking fails (version mismatch)
 */
export class OptimisticLockError extends Error {
  readonly code = 'OPTIMISTIC_LOCK_ERROR'

  constructor(
    public readonly entityId: string,
    public readonly expectedVersion: number,
  ) {
    super(
      `Optimistic lock failed for entity ${entityId}: `
      + `expected version ${expectedVersion} but entity was modified`,
    )
    this.name = 'OptimisticLockError'
  }
}

/**
 * Error thrown when an entity is not found
 */
export class NotFoundError extends Error {
  readonly code = 'NOT_FOUND_ERROR'

  constructor(
    public readonly entityId: string,
    public readonly entityType?: string,
  ) {
    super(
      entityType
        ? `${entityType} with id ${entityId} not found`
        : `Entity with id ${entityId} not found`,
    )
    this.name = 'NotFoundError'
  }
}

/**
 * Error thrown when a validation fails
 */
export class ValidationError extends Error {
  readonly code = 'VALIDATION_ERROR'

  constructor(
    message: string,
    public readonly field?: string,
  ) {
    super(message)
    this.name = 'ValidationError'
  }
}
