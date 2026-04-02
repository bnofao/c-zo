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

// type WhereInput = Record<string, string | null | string[] | WhereInput>

export function fromWhereGlobalId(key: string, input?: Record<string, unknown> | null): Record<string, unknown> {
  if (!input) {
    return {}
  }

  const deepKeys = ['AND', 'OR', 'NOT']

  const result = Object.entries(input).map(([_key, value]) => {
    if (typeof value === 'string') {
      return [_key, fromGlobalId(value).id]
    }

    if (Array.isArray(value)) {
      if (deepKeys?.includes(_key)) {
        return [_key, value.map(v => fromWhereGlobalId(key, v)[key])]
      }

      return [_key, value.map(v => fromGlobalId(v).id)]
    }

    if (value !== null && typeof value === 'object' && deepKeys.includes(_key)) {
      return [_key, fromWhereGlobalId(key, value as any)[key]]
    }

    return [_key, value]
  })

  if (result.length > 0) {
    return {
      [key]: Object.fromEntries(result) as Record<string, unknown>,
    }
  }

  return {}
}
