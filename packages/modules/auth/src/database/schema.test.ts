import { getTableName } from 'drizzle-orm'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import * as schema from './schema'

describe('auth database schema', () => {
  describe('users table', () => {
    it('should be named "users"', () => {
      expect(getTableName(schema.users)).toBe('users')
    })

    it('should have required columns', () => {
      const config = getTableConfig(schema.users)
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
      const config = getTableConfig(schema.users)
      const emailCol = config.columns.find(c => c.name === 'email')
      expect(emailCol?.isUnique).toBe(true)
    })
  })

  describe('sessions table', () => {
    it('should be named "sessions"', () => {
      expect(getTableName(schema.sessions)).toBe('sessions')
    })

    it('should have required columns', () => {
      const config = getTableConfig(schema.sessions)
      const columnNames = config.columns.map(c => c.name)

      expect(columnNames).toContain('id')
      expect(columnNames).toContain('expires_at')
      expect(columnNames).toContain('token')
      expect(columnNames).toContain('created_at')
      expect(columnNames).toContain('updated_at')
      expect(columnNames).toContain('ip_address')
      expect(columnNames).toContain('user_agent')
      expect(columnNames).toContain('user_id')
      expect(columnNames).toContain('actor_type')
      expect(columnNames).toContain('auth_method')
      expect(columnNames).toContain('organization_id')
    })

    it('should have actor_type with default "customer"', () => {
      const config = getTableConfig(schema.sessions)
      const col = config.columns.find(c => c.name === 'actor_type')
      expect(col).toBeDefined()
      expect(col!.notNull).toBe(true)
      expect(col!.default).toBe('customer')
    })

    it('should have auth_method with default "email"', () => {
      const config = getTableConfig(schema.sessions)
      const col = config.columns.find(c => c.name === 'auth_method')
      expect(col).toBeDefined()
      expect(col!.notNull).toBe(true)
      expect(col!.default).toBe('email')
    })

    it('should have organization_id as nullable', () => {
      const config = getTableConfig(schema.sessions)
      const col = config.columns.find(c => c.name === 'organization_id')
      expect(col).toBeDefined()
      expect(col!.notNull).toBe(false)
    })

    it('should have token as unique', () => {
      const config = getTableConfig(schema.sessions)
      const tokenCol = config.columns.find(c => c.name === 'token')
      expect(tokenCol?.isUnique).toBe(true)
    })

    it('should have a foreign key to user with cascade delete', () => {
      const config = getTableConfig(schema.sessions)
      expect(config.foreignKeys.length).toBeGreaterThan(0)
      const fk = config.foreignKeys[0]!
      expect(fk.onDelete).toBe('cascade')
    })
  })

  describe('accounts table', () => {
    it('should be named "accounts"', () => {
      expect(getTableName(schema.accounts)).toBe('accounts')
    })

    it('should have required columns', () => {
      const config = getTableConfig(schema.accounts)
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
      const config = getTableConfig(schema.accounts)
      expect(config.foreignKeys.length).toBeGreaterThan(0)
      const fk = config.foreignKeys[0]!
      expect(fk.onDelete).toBe('cascade')
    })
  })

  describe('verifications table', () => {
    it('should be named "verifications"', () => {
      expect(getTableName(schema.verifications)).toBe('verifications')
    })

    it('should have required columns', () => {
      const config = getTableConfig(schema.verifications)
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

  describe('organizations table', () => {
    it('should be named "organizations"', () => {
      expect(getTableName(schema.organizations)).toBe('organizations')
    })

    it('should have required columns', () => {
      const config = getTableConfig(schema.organizations)
      const columnNames = config.columns.map(c => c.name)

      expect(columnNames).toContain('id')
      expect(columnNames).toContain('name')
      expect(columnNames).toContain('slug')
      expect(columnNames).toContain('logo')
      expect(columnNames).toContain('metadata')
      expect(columnNames).toContain('type')
      expect(columnNames).toContain('created_at')
      expect(columnNames).toContain('updated_at')
    })

    it('should have type column as nullable', () => {
      const config = getTableConfig(schema.organizations)
      const col = config.columns.find(c => c.name === 'type')
      expect(col).toBeDefined()
      expect(col!.notNull).toBe(false)
    })

    it('should have slug as unique', () => {
      const config = getTableConfig(schema.organizations)
      const slugCol = config.columns.find(c => c.name === 'slug')
      expect(slugCol?.isUnique).toBe(true)
    })
  })

  it('should export all 5 tables', () => {
    expect(schema.users).toBeDefined()
    expect(schema.sessions).toBeDefined()
    expect(schema.accounts).toBeDefined()
    expect(schema.verifications).toBeDefined()
    expect(schema.jwks).toBeDefined()
  })
})
