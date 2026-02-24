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
      expect(columnNames).toContain('two_factor_enabled')
      expect(columnNames).toContain('created_at')
      expect(columnNames).toContain('updated_at')
    })

    it('should have two_factor_enabled with default false', () => {
      const config = getTableConfig(schema.users)
      const col = config.columns.find(c => c.name === 'two_factor_enabled')
      expect(col).toBeDefined()
      expect(col!.default).toBe(false)
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

  describe('twoFactor table', () => {
    it('should be named "two_factors"', () => {
      expect(getTableName(schema.twoFactor)).toBe('two_factors')
    })

    it('should have required columns', () => {
      const config = getTableConfig(schema.twoFactor)
      const columnNames = config.columns.map(c => c.name)

      expect(columnNames).toContain('id')
      expect(columnNames).toContain('secret')
      expect(columnNames).toContain('backup_codes')
      expect(columnNames).toContain('user_id')
    })

    it('should have a foreign key to user with cascade delete', () => {
      const config = getTableConfig(schema.twoFactor)
      expect(config.foreignKeys.length).toBeGreaterThan(0)
      const fk = config.foreignKeys[0]!
      expect(fk.onDelete).toBe('cascade')
    })
  })

  describe('apikeys table', () => {
    it('should be named "apikeys"', () => {
      expect(getTableName(schema.apikeys)).toBe('apikeys')
    })

    it('should have required columns', () => {
      const config = getTableConfig(schema.apikeys)
      const columnNames = config.columns.map(c => c.name)

      expect(columnNames).toContain('id')
      expect(columnNames).toContain('name')
      expect(columnNames).toContain('start')
      expect(columnNames).toContain('prefix')
      expect(columnNames).toContain('key')
      expect(columnNames).toContain('user_id')
      expect(columnNames).toContain('enabled')
      expect(columnNames).toContain('rate_limit_enabled')
      expect(columnNames).toContain('request_count')
      expect(columnNames).toContain('created_at')
      expect(columnNames).toContain('updated_at')
      expect(columnNames).toContain('permissions')
      expect(columnNames).toContain('metadata')
    })

    it('should have enabled with default true', () => {
      const config = getTableConfig(schema.apikeys)
      const col = config.columns.find(c => c.name === 'enabled')
      expect(col).toBeDefined()
      expect(col!.default).toBe(true)
    })

    it('should have a foreign key to user with cascade delete', () => {
      const config = getTableConfig(schema.apikeys)
      expect(config.foreignKeys.length).toBeGreaterThan(0)
      const fk = config.foreignKeys[0]!
      expect(fk.onDelete).toBe('cascade')
    })
  })

  describe('apps table', () => {
    it('should be named "apps"', () => {
      expect(getTableName(schema.apps)).toBe('apps')
    })

    it('should have required columns', () => {
      const config = getTableConfig(schema.apps)
      const columnNames = config.columns.map(c => c.name)

      expect(columnNames).toContain('id')
      expect(columnNames).toContain('app_id')
      expect(columnNames).toContain('manifest')
      expect(columnNames).toContain('installed_by')
      expect(columnNames).toContain('created_at')
      expect(columnNames).toContain('updated_at')
    })

    it('should have app_id as unique', () => {
      const config = getTableConfig(schema.apps)
      const col = config.columns.find(c => c.name === 'app_id')
      expect(col?.isUnique).toBe(true)
    })

    it('should have a foreign key to users for installed_by', () => {
      const config = getTableConfig(schema.apps)
      expect(config.foreignKeys.length).toBeGreaterThan(0)
    })
  })

  describe('webhookDeliveries table', () => {
    it('should be named "webhook_deliveries"', () => {
      expect(getTableName(schema.webhookDeliveries)).toBe('webhook_deliveries')
    })

    it('should have required columns', () => {
      const config = getTableConfig(schema.webhookDeliveries)
      const columnNames = config.columns.map(c => c.name)

      expect(columnNames).toContain('id')
      expect(columnNames).toContain('app_id')
      expect(columnNames).toContain('event')
      expect(columnNames).toContain('payload')
      expect(columnNames).toContain('status')
      expect(columnNames).toContain('attempts')
      expect(columnNames).toContain('last_attempt_at')
      expect(columnNames).toContain('response_code')
      expect(columnNames).toContain('response_body')
      expect(columnNames).toContain('created_at')
    })

    it('should have status with default "pending"', () => {
      const config = getTableConfig(schema.webhookDeliveries)
      const col = config.columns.find(c => c.name === 'status')
      expect(col).toBeDefined()
      expect(col!.default).toBe('pending')
    })

    it('should have indexes defined', () => {
      const config = getTableConfig(schema.webhookDeliveries)
      expect(config.indexes.length).toBe(2)
    })

    it('should have a foreign key to apps', () => {
      const config = getTableConfig(schema.webhookDeliveries)
      expect(config.foreignKeys.length).toBeGreaterThan(0)
    })
  })

  describe('apikeys table — app integration', () => {
    it('should have installed_app_id column', () => {
      const config = getTableConfig(schema.apikeys)
      const col = config.columns.find(c => c.name === 'installed_app_id')
      expect(col).toBeDefined()
      expect(col!.notNull).toBe(false)
    })

    it('should have two foreign keys (users + apps)', () => {
      const config = getTableConfig(schema.apikeys)
      expect(config.foreignKeys.length).toBe(2)
    })
  })

  it('should export all tables', () => {
    expect(schema.users).toBeDefined()
    expect(schema.sessions).toBeDefined()
    expect(schema.accounts).toBeDefined()
    expect(schema.verifications).toBeDefined()
    expect(schema.twoFactor).toBeDefined()
    expect(schema.apikeys).toBeDefined()
    expect(schema.apps).toBeDefined()
    expect(schema.webhookDeliveries).toBeDefined()
  })
})
