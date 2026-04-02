export function encodeCursor(values: unknown[]): string {
  return btoa(JSON.stringify(values))
}

export function decodeCursor(cursor: string): unknown[] {
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

  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  }
  catch {
    throw new Error('Invalid cursor: not valid JSON')
  }

  if (!Array.isArray(parsed)) {
    throw new TypeError('Invalid cursor: expected array')
  }

  return parsed
}
