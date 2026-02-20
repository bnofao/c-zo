import { describe, expect, it } from 'vitest'
import { validatePasswordStrength } from './password'

describe('validatePasswordStrength', () => {
  it('should accept a strong password', () => {
    const result = validatePasswordStrength('MyP@ssw0rd!')
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('should reject a password shorter than 8 characters', () => {
    const result = validatePasswordStrength('Ab1!')
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Must be at least 8 characters')
  })

  it('should reject a password longer than 128 characters', () => {
    const result = validatePasswordStrength('A'.repeat(129) + 'a1!')
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Must be at most 128 characters')
  })

  it('should reject a password without lowercase letters', () => {
    const result = validatePasswordStrength('ABCDEFG1!')
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Must contain a lowercase letter')
  })

  it('should reject a password without uppercase letters', () => {
    const result = validatePasswordStrength('abcdefg1!')
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Must contain an uppercase letter')
  })

  it('should reject a password without digits', () => {
    const result = validatePasswordStrength('Abcdefgh!')
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Must contain a digit')
  })

  it('should reject a password without special characters', () => {
    const result = validatePasswordStrength('Abcdefg1')
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Must contain a special character')
  })

  it('should return multiple errors for very weak passwords', () => {
    const result = validatePasswordStrength('abc')
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(1)
  })
})
