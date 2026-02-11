import { getTableName } from 'drizzle-orm'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import * as schema from './schema'

describe('auth database schema', () => {
  describe('user table', () => {
    it('should be named "user"', () => {
      expect(getTableName(schema.user)).toBe('user')
    })

    it('should have required columns', () => {
      const config = getTableConfig(schema.user)
      const columnNames = config.columns.map(c => c.name)

      expect(columnNames).toContain('id')
      expect(columnNames).toContain('name')
      expect(columnNames).toContain('email')
      expect(columnNames).toContain('email_verified')
      expect(columnNames).toContain('image')
      expect(columnNames).toContain('created_at')
      expect(columnNames).toContain('updated_at')
    })

    it('should have email as unique', () => {
      const config = getTableConfig(schema.user)
      const emailCol = config.columns.find(c => c.name === 'email')
      expect(emailCol?.isUnique).toBe(true)
    })
  })

  describe('session table', () => {
    it('should be named "session"', () => {
      expect(getTableName(schema.session)).toBe('session')
    })

    it('should have required columns', () => {
      const config = getTableConfig(schema.session)
      const columnNames = config.columns.map(c => c.name)

      expect(columnNames).toContain('id')
      expect(columnNames).toContain('expires_at')
      expect(columnNames).toContain('token')
      expect(columnNames).toContain('created_at')
      expect(columnNames).toContain('updated_at')
      expect(columnNames).toContain('ip_address')
      expect(columnNames).toContain('user_agent')
      expect(columnNames).toContain('user_id')
    })

    it('should have token as unique', () => {
      const config = getTableConfig(schema.session)
      const tokenCol = config.columns.find(c => c.name === 'token')
      expect(tokenCol?.isUnique).toBe(true)
    })

    it('should have a foreign key to user with cascade delete', () => {
      const config = getTableConfig(schema.session)
      expect(config.foreignKeys.length).toBeGreaterThan(0)
      const fk = config.foreignKeys[0]!
      expect(fk.onDelete).toBe('cascade')
    })
  })

  describe('account table', () => {
    it('should be named "account"', () => {
      expect(getTableName(schema.account)).toBe('account')
    })

    it('should have required columns', () => {
      const config = getTableConfig(schema.account)
      const columnNames = config.columns.map(c => c.name)

      expect(columnNames).toContain('id')
      expect(columnNames).toContain('account_id')
      expect(columnNames).toContain('provider_id')
      expect(columnNames).toContain('user_id')
      expect(columnNames).toContain('password')
      expect(columnNames).toContain('created_at')
      expect(columnNames).toContain('updated_at')
    })

    it('should have a foreign key to user with cascade delete', () => {
      const config = getTableConfig(schema.account)
      expect(config.foreignKeys.length).toBeGreaterThan(0)
      const fk = config.foreignKeys[0]!
      expect(fk.onDelete).toBe('cascade')
    })
  })

  describe('verification table', () => {
    it('should be named "verification"', () => {
      expect(getTableName(schema.verification)).toBe('verification')
    })

    it('should have required columns', () => {
      const config = getTableConfig(schema.verification)
      const columnNames = config.columns.map(c => c.name)

      expect(columnNames).toContain('id')
      expect(columnNames).toContain('identifier')
      expect(columnNames).toContain('value')
      expect(columnNames).toContain('expires_at')
    })
  })

  describe('jwks table', () => {
    it('should be named "jwks"', () => {
      expect(getTableName(schema.jwks)).toBe('jwks')
    })

    it('should have required columns', () => {
      const config = getTableConfig(schema.jwks)
      const columnNames = config.columns.map(c => c.name)

      expect(columnNames).toContain('id')
      expect(columnNames).toContain('public_key')
      expect(columnNames).toContain('private_key')
      expect(columnNames).toContain('created_at')
    })
  })

  it('should export all 5 tables', () => {
    expect(schema.user).toBeDefined()
    expect(schema.session).toBeDefined()
    expect(schema.account).toBeDefined()
    expect(schema.verification).toBeDefined()
    expect(schema.jwks).toBeDefined()
  })
})
