/**
 * Utility functions for transforming data between API and database formats
 */

/**
 * Convert camelCase to snake_case
 */
export function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)
}

/**
 * Transform an object from camelCase keys to snake_case keys
 */
export function toSnakeCase<T extends Record<string, any>>(obj: T): Record<string, any> {
  const result: Record<string, any> = {}

  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = camelToSnake(key)
    result[snakeKey] = value
  }

  return result
}

/**
 * Convert snake_case to camelCase
 */
export function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_match, letter) => letter.toUpperCase())
}

/**
 * Transform an object from snake_case keys to camelCase keys
 */
export function toCamelCase<T extends Record<string, any>>(obj: T): Record<string, any> {
  const result: Record<string, any> = {}

  for (const [key, value] of Object.entries(obj)) {
    const camelKey = snakeToCamel(key)
    result[camelKey] = value
  }

  return result
}

/**
 * Map validated input (camelCase) to database format (snake_case)
 * Handles null/undefined conversion and removes undefined values
 */
export function mapToDatabase<T extends Record<string, any>>(
  input: T,
  defaults?: Record<string, any>,
  excludeKeys: string[] = ['expectedUpdatedAt'], // Keys to exclude from mapping
): Record<string, any> {
  const mapped: Record<string, any> = {}

  for (const [key, value] of Object.entries(input)) {
    // Skip excluded keys (e.g., expectedUpdatedAt which is not a DB column)
    if (excludeKeys.includes(key)) {
      continue
    }

    const snakeKey = camelToSnake(key)

    // Convert undefined to null for optional database fields
    if (value === undefined) {
      if (defaults && key in defaults) {
        mapped[snakeKey] = defaults[key]
      }
      // Skip undefined values without defaults
    }
    else {
      mapped[snakeKey] = value
    }
  }

  return mapped
}
