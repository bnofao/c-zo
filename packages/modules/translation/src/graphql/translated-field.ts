/** Pure overlay: the requested locale's column value if present+non-null, else the base. */
export function pickTranslation<T extends { localeCode: string }>(
  translations: ReadonlyArray<T>,
  locale: string | null | undefined,
  field: keyof T & string,
  base: string | null,
): string | null {
  if (locale == null)
    return base
  const row = translations.find(t => t.localeCode === locale)
  const value = row?.[field]
  return (value == null || value === '') ? base : (value as unknown as string)
}

/**
 * Build a `<field>(locale: String): String` field that overlays translation-or-base.
 *
 * `relation` is the consumer's pivot relation name (e.g. 'translations'); the parent
 * row's `relation` array (loaded via the `pothosDrizzleSelect` extension below, batched
 * across the list) holds `{ localeCode, <field> }` rows. `base` reads the parent's base column.
 *
 * Usage in a consumer drizzleNode:
 *   name: translatedField(t, { relation: 'translations', field: 'name', base: r => r.name })
 */
export function translatedField(
  t: any,
  opts: { relation: string, field: string, base: (parent: any) => string | null, nullable?: boolean },
) {
  return t.field({
    type: 'String',
    nullable: opts.nullable ?? false,
    args: { locale: t.arg.string({ required: false }) },
    // Force the Pothos-drizzle plugin to load the pivot relation into the batched
    // parent query. We set `pothosDrizzleSelect` on the field extension directly
    // (the sink the plugin reads in `addFieldSelection`), rather than relying on
    // the `select` field option being promoted — explicit and robust.
    extensions: { pothosDrizzleSelect: { with: { [opts.relation]: true } } },
    resolve: (parent: any, args: { locale?: string | null }) =>
      pickTranslation<{ localeCode: string } & Record<string, string | null>>(parent[opts.relation] ?? [], args.locale ?? undefined, opts.field, opts.base(parent)),
  })
}
