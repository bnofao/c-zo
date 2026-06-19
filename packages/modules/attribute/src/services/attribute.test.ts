import { describe, expect, it } from 'vitest'
import { isSelectType } from './attribute'

describe('isSelectType', () => {
  it.each(['DROPDOWN', 'MULTISELECT', 'SWATCH', 'REFERENCE'] as const)(
    '%s is a select type',
    (type) => { expect(isSelectType(type)).toBe(true) },
  )

  it.each(['PLAIN_TEXT', 'RICH_TEXT', 'NUMERIC', 'BOOLEAN', 'DATE', 'DATE_TIME', 'FILE'] as const)(
    '%s is not a select type',
    (type) => { expect(isSelectType(type)).toBe(false) },
  )
})
