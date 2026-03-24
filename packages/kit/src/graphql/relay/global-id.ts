export function toGlobalId(type: string, localId: string): string {
  return btoa(`${type}:${localId}`)
}

export function fromGlobalId(globalId: string): { type: string, id: string } {
  if (!globalId) {
    throw new Error('Invalid global ID: empty string')
  }

  let decoded: string
  try {
    decoded = atob(globalId)
  }
  catch {
    throw new Error('Invalid global ID: not valid base64')
  }

  const colonIndex = decoded.indexOf(':')
  if (colonIndex === -1) {
    throw new Error('Invalid global ID: missing type separator')
  }

  const type = decoded.slice(0, colonIndex)
  const id = decoded.slice(colonIndex + 1)

  if (!type || !id) {
    throw new Error('Invalid global ID: empty type or id')
  }

  return { type, id }
}
