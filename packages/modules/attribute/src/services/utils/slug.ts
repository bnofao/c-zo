/** URL-safe slug: lowercase, alphanumerics, single hyphens, no leading/trailing hyphen. */
export function generateSlug(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Matches a valid slug (used by validation + DB callers). */
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
