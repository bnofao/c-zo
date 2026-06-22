import { NativeSelect, NativeSelectOption } from '@workspace/ui'

export function Default() {
  return (
    <NativeSelect className="w-60" defaultValue="published">
      <NativeSelectOption value="published">Published</NativeSelectOption>
      <NativeSelectOption value="draft">Draft</NativeSelectOption>
      <NativeSelectOption value="archived">Archived</NativeSelectOption>
    </NativeSelect>
  )
}
