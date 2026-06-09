// AttributeType mirrors attributeTypeEnum.enumValues from @czo/attribute/schema.
// Kept local because @czo/attribute does not export this type from a public entry point.
export type AttributeType
  = | 'DROPDOWN'
    | 'MULTISELECT'
    | 'PLAIN_TEXT'
    | 'RICH_TEXT'
    | 'NUMERIC'
    | 'BOOLEAN'
    | 'FILE'
    | 'REFERENCE'
    | 'SWATCH'
    | 'DATE'
    | 'DATE_TIME'

export type ValueKind = 'VALUE' | 'SWATCH' | 'REFERENCE' | 'TEXT' | 'NUMERIC' | 'BOOLEAN' | 'DATE' | 'FILE'

const KIND: Record<AttributeType, ValueKind> = {
  DROPDOWN: 'VALUE',
  MULTISELECT: 'VALUE',
  SWATCH: 'SWATCH',
  REFERENCE: 'REFERENCE',
  PLAIN_TEXT: 'TEXT',
  RICH_TEXT: 'TEXT',
  NUMERIC: 'NUMERIC',
  BOOLEAN: 'BOOLEAN',
  DATE: 'DATE',
  DATE_TIME: 'DATE',
  FILE: 'FILE',
}

const SELECT = new Set<AttributeType>(['DROPDOWN', 'MULTISELECT', 'SWATCH', 'REFERENCE'])

export function valueKindForType(t: AttributeType): ValueKind {
  return KIND[t]
}
export function isSelectType(t: AttributeType): boolean {
  return SELECT.has(t)
}
