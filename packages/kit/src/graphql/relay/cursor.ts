export function encodeCursor(values: Record<string, unknown>): string {
  return btoa(JSON.stringify(values))
}

export function decodeCursor(cursor: string): Record<string, unknown> {
  if (!cursor) {
    throw new Error('Invalid cursor: empty string')
  }

  let json: string
  try {
    json = atob(cursor)
  }
  catch {
    throw new Error('Invalid cursor: not valid base64')
  }

  try {
    return JSON.parse(json) as Record<string, unknown>
  }
  catch {
    throw new Error('Invalid cursor: not valid JSON')
  }
}
