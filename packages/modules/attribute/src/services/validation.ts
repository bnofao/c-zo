export type Valid = { ok: true } | { ok: false, code: string, message: string }

const HEX_RE = /^#[0-9a-f]{6}$/i
const HEX_LENIENT_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

export function validateHexColor(color: string): Valid {
  return HEX_RE.test(color)
    ? { ok: true }
    : { ok: false, code: 'VALIDATION_ERROR', message: 'Color must be hex #RRGGBB' }
}

export interface FileInput {
  url: string
  mimetype: string
}

export function validateSwatchVisual(input: { color?: string | null, file?: FileInput | null }): Valid {
  if (input.color == null && input.file == null)
    return { ok: false, code: 'SWATCH_REQUIRES_COLOR_OR_FILE', message: 'Swatch needs a color or a file' }
  if (input.color != null && !HEX_LENIENT_RE.test(input.color))
    return { ok: false, code: 'VALIDATION_ERROR', message: 'Color must be hex #RGB or #RRGGBB' }
  if (input.file != null && !input.file.mimetype)
    return { ok: false, code: 'VALIDATION_ERROR', message: 'file.mimetype is required' }
  return { ok: true }
}

export function validateReferenceAttribute(type: string, referenceEntity: string | null | undefined): Valid {
  if (type === 'REFERENCE' && !referenceEntity)
    return { ok: false, code: 'REFERENCE_ENTITY_REQUIRED', message: 'REFERENCE requires referenceEntity' }
  if (type !== 'REFERENCE' && referenceEntity)
    return { ok: false, code: 'VALIDATION_ERROR', message: 'referenceEntity only valid for REFERENCE' }
  return { ok: true }
}
