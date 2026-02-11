import { describe, expect, it } from 'vitest'
import { validatePasswordStrength } from './password'

describe('validatePasswordStrength', () => {
  it('should accept a valid password', () => {
    const result = validatePasswordStrength('MyP@ssw0rd')
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('should accept a password at minimum length', () => {
    const result = validatePasswordStrength('Aa1!xxxx')
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('should accept a password at maximum length', () => {
    const base = `Aa1!${'x'.repeat(124)}`
    expect(base.length).toBe(128)
    const result = validatePasswordStrength(base)
    expect(result.valid).toBe(true)
  })

  it('should reject a password that is too short', () => {
    const result = validatePasswordStrength('Aa1!xxx')
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Must be at least 8 characters')
  })

  it('should reject a password that is too long', () => {
    const result = validatePasswordStrength(`Aa1!${'x'.repeat(125)}`)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Must be at most 128 characters')
  })

  it('should reject a password missing a lowercase letter', () => {
    const result = validatePasswordStrength('AAAA1111!')
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Must contain a lowercase letter')
  })

  it('should reject a password missing an uppercase letter', () => {
    const result = validatePasswordStrength('aaaa1111!')
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Must contain an uppercase letter')
  })

  it('should reject a password missing a digit', () => {
    const result = validatePasswordStrength('Aaaa!!!!x')
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Must contain a digit')
  })

  it('should reject a password missing a special character', () => {
    const result = validatePasswordStrength('Aaaa1111x')
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Must contain a special character')
  })

  it('should report multiple violations at once', () => {
    const result = validatePasswordStrength('aaa')
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThanOrEqual(3)
  })

  it('should reject an empty string', () => {
    const result = validatePasswordStrength('')
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Must be at least 8 characters')
  })

  it('should accept passwords with unicode special characters', () => {
    const result = validatePasswordStrength('Aa1€abcd')
    expect(result.valid).toBe(true)
  })
})
