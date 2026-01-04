import type { Database } from '@czo/product/database'
import type { Kysely } from 'kysely'

/**
 * Slugify a string to create a URL-safe handle
 * @param text - Text to convert to handle
 * @returns URL-safe handle
 */
export function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    // Replace spaces with -
    .replace(/\s+/g, '-')
    // Remove all non-word chars except -
    .replace(/[^\w\-]+/g, '')
    // Replace multiple - with single -
    .replace(/-{2,}/g, '-')
    // Remove leading/trailing -
    .replace(/^-+|-+$/g, '')
}

/**
 * Generate a unique handle for an entity
 * @param db - Kysely database instance
 * @param table - Table name to check uniqueness
 * @param title - Title to generate handle from
 * @param customHandle - Optional custom handle
 * @returns Unique handle
 */
export async function generateUniqueHandle<T>(
  db: Kysely<any>,
  table: keyof Database,
  title: string,
  customHandle?: string,
): Promise<string> {
  const baseHandle = customHandle || slugify(title)

  // Validate length
  if (baseHandle.length > 255) {
    throw new Error('Handle exceeds maximum length of 255 characters')
  }

  // Check uniqueness
  const existing = await db
    .selectFrom(table as any)
    .select('handle')
    .where('handle', '=', baseHandle)
    .where('deleted_at', 'is', null)
    .executeTakeFirst()

  if (!existing) {
    return baseHandle
  }

  // Add numeric suffix for uniqueness
  let suffix = 1
  while (suffix < 1000) { // Safety limit
    const handle = `${baseHandle}-${suffix}`
    const exists = await db
      .selectFrom(table as any)
      .select('handle')
      .where('handle', '=', handle)
      .where('deleted_at', 'is', null)
      .executeTakeFirst()

    if (!exists) {
      return handle
    }
    suffix++
  }

  throw new Error('Could not generate unique handle after 1000 attempts')
}
