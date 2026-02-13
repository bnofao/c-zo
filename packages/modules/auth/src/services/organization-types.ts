export const ORG_TYPES = ['merchant', 'delivery', 'warehouse', 'supplier'] as const
export type OrgType = (typeof ORG_TYPES)[number]

export function isValidOrgType(type: string): type is OrgType {
  return (ORG_TYPES as readonly string[]).includes(type)
}

export function validateOrgType(type: string | null | undefined): string | null {
  if (type == null || type === '')
    return null
  if (!isValidOrgType(type)) {
    throw new Error(`Invalid organization type: "${type}". Must be one of: ${ORG_TYPES.join(', ')}`)
  }
  return type
}
