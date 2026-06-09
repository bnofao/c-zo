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
    description: 'A file reference attached to an attribute value (swatch image or file value): a URL plus its MIME type.',
    fields: t => ({
      url: t.exposeString('url', { description: 'URL of the file asset.' }),
      mimetype: t.exposeString('mimetype', { description: 'MIME type of the file (e.g. `image/png`).' }),
    }),
  })

  builder.inputType('FileInfoInput', {
    description: 'Write counterpart of FileInfo: the file URL and its MIME type to store on an attribute value.',
    fields: t => ({
      url: t.string({ required: true, description: 'URL of the file asset.' }),
      mimetype: t.string({ required: true, description: 'MIME type of the file (e.g. `image/png`).' }),
    }),
  })
}
