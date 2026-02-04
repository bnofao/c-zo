import { describe, expect, it } from 'vitest'
import { NotFoundError, OptimisticLockError, ValidationError } from './errors'

describe('repository Errors', () => {
  describe('optimisticLockError', () => {
    it('should create error with correct message', () => {
      const error = new OptimisticLockError('entity-123', 5)

      expect(error.message).toBe(
        'Optimistic lock failed for entity entity-123: expected version 5 but entity was modified',
      )
    })

    it('should have correct name', () => {
      const error = new OptimisticLockError('id', 1)
      expect(error.name).toBe('OptimisticLockError')
    })

    it('should have correct code', () => {
      const error = new OptimisticLockError('id', 1)
      expect(error.code).toBe('OPTIMISTIC_LOCK_ERROR')
    })

    it('should store entityId', () => {
      const error = new OptimisticLockError('my-entity', 1)
      expect(error.entityId).toBe('my-entity')
    })

    it('should store expectedVersion', () => {
      const error = new OptimisticLockError('id', 42)
      expect(error.expectedVersion).toBe(42)
    })

    it('should be instanceof Error', () => {
      const error = new OptimisticLockError('id', 1)
      expect(error).toBeInstanceOf(Error)
    })
  })

  describe('notFoundError', () => {
    it('should create error with basic message', () => {
      const error = new NotFoundError('entity-456')

      expect(error.message).toBe('Entity with id entity-456 not found')
    })

    it('should create error with entity type', () => {
      const error = new NotFoundError('product-789', 'Product')

      expect(error.message).toBe('Product with id product-789 not found')
    })

    it('should have correct name', () => {
      const error = new NotFoundError('id')
      expect(error.name).toBe('NotFoundError')
    })

    it('should have correct code', () => {
      const error = new NotFoundError('id')
      expect(error.code).toBe('NOT_FOUND_ERROR')
    })

    it('should store entityId', () => {
      const error = new NotFoundError('my-entity')
      expect(error.entityId).toBe('my-entity')
    })

    it('should store entityType when provided', () => {
      const error = new NotFoundError('id', 'Product')
      expect(error.entityType).toBe('Product')
    })

    it('should have undefined entityType when not provided', () => {
      const error = new NotFoundError('id')
      expect(error.entityType).toBeUndefined()
    })

    it('should be instanceof Error', () => {
      const error = new NotFoundError('id')
      expect(error).toBeInstanceOf(Error)
    })
  })

  describe('validationError', () => {
    it('should create error with message', () => {
      const error = new ValidationError('Invalid input')

      expect(error.message).toBe('Invalid input')
    })

    it('should create error with field', () => {
      const error = new ValidationError('Title is required', 'title')

      expect(error.message).toBe('Title is required')
      expect(error.field).toBe('title')
    })

    it('should have correct name', () => {
      const error = new ValidationError('error')
      expect(error.name).toBe('ValidationError')
    })

    it('should have correct code', () => {
      const error = new ValidationError('error')
      expect(error.code).toBe('VALIDATION_ERROR')
    })

    it('should have undefined field when not provided', () => {
      const error = new ValidationError('error')
      expect(error.field).toBeUndefined()
    })

    it('should be instanceof Error', () => {
      const error = new ValidationError('error')
      expect(error).toBeInstanceOf(Error)
    })
  })
})
