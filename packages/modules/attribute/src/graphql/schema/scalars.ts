// Attribute module — shared scalar / small object + input types.
//
// `DateTime`, `JSONObject` are kit-global scalars (registered by the kit
// builder); we REUSE them via `t.expose(..., { type: 'DateTime' })` and
// `t.field({ type: 'JSONObject' })` — they are NOT redefined here.
//
// `FileInfo` is the read shape for a file-backed value (swatch file, file
// value). `FileInfoInput` is its write counterpart, consumed by Task 9 inputs.

import type { AttributeGraphQLSchemaBuilder } from '..'

/** A file reference: a URL plus its MIME type. */
export interface FileInfo {
  url: string
  mimetype: string
}

export function registerAttributeScalars(builder: AttributeGraphQLSchemaBuilder): void {
  builder.objectRef<FileInfo>('FileInfo').implement({
    fields: t => ({
      url: t.exposeString('url'),
      mimetype: t.exposeString('mimetype'),
    }),
  })

  builder.inputType('FileInfoInput', {
    fields: t => ({
      url: t.string({ required: true }),
      mimetype: t.string({ required: true }),
    }),
  })
}
