export interface PasswordValidationResult {
  valid: boolean
  errors: string[]
}

const MIN_LENGTH = 8
const MAX_LENGTH = 128

export function validatePasswordStrength(password: string): PasswordValidationResult {
  const errors: string[] = []

  if (password.length < MIN_LENGTH) {
    errors.push(`Must be at least ${MIN_LENGTH} characters`)
  }

  if (password.length > MAX_LENGTH) {
    errors.push(`Must be at most ${MAX_LENGTH} characters`)
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Must contain a lowercase letter')
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Must contain an uppercase letter')
  }

  if (!/\d/.test(password)) {
    errors.push('Must contain a digit')
  }

  if (!/[^a-z0-9]/i.test(password)) {
    errors.push('Must contain a special character')
  }

  return { valid: errors.length === 0, errors }
}
