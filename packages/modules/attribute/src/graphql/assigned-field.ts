// Reusable Pothos field builders for typed `AssignedAttribute` reads, plus the
// row→assignment grouping they wrap. The attribute module owns the
// `AssignedAttribute` interface (see `schema/assigned.ts`), so it also owns the
// mapping from loaded pivot rows — keyed on each attribute's own `type` — to it.
//
// What stays with the CONSUMER (e.g. `@czo/product`): how the attribute-value
// rows are loaded (the `pothosDrizzleSelect` graph), how the owning object's
// graft org is resolved (channels, viewer org, …), and the field's auth gating.
// Those are injected via `with` / `rows` / `org` / `authScopes` — the helper
// has no knowledge of the consumer's domain (mirrors `@czo/translation`'s
// `translatedField`).

import type {
  attributeBooleanValues,
  attributeDateValues,
  attributeFileValues,
  attributeNumericValues,
  attributeReferenceValues,
  attributes,
  attributeSwatchValues,
  attributeTextValues,
  attributeValues,
} from '../database/schema'
import type { AnyAssignment } from './schema/assigned'

// `t` is the Pothos drizzle field builder (`DrizzleObjectFieldBuilder`). It is
// typed `any` on purpose, mirroring `@czo/translation`'s `translatedField`:
// typing it precisely forces an explicit `FieldRef<…>` return annotation
// (TS2742, non-portable across hoisted @pothos/core copies), and buys no safety
// here — `parent`/`args` are intentionally opaque (the graft wiring is injected).

// The value relations a grouped assignment reads. A pivot row (product- or
// variant-attribute-value, column-identical) contributes the tenancy + ordering
// columns; both carry the same cross-module value relations, so one overlay fits.
interface AssignedValueRelations {
  attribute: typeof attributes.$inferSelect
  selectValue?: typeof attributeValues.$inferSelect | null
  swatchValue?: typeof attributeSwatchValues.$inferSelect | null
  referenceValue?: typeof attributeReferenceValues.$inferSelect | null
  numericValue?: typeof attributeNumericValues.$inferSelect | null
  booleanValue?: typeof attributeBooleanValues.$inferSelect | null
  dateValue?: typeof attributeDateValues.$inferSelect | null
  textValue?: typeof attributeTextValues.$inferSelect | null
  fileValue?: typeof attributeFileValues.$inferSelect | null
}

/** A loaded attribute-value pivot row with its value relations, as `groupAssigned` reads it. */
export interface AssignedRow extends AssignedValueRelations {
  organizationId: number | null
  attributeId: number
  position: number
}

/**
 * Group loaded attribute-value rows into `AssignedAttribute`s: apply the base∪org
 * tenancy filter, group by `attributeId`, and map each group into the concrete
 * `AttributeAssignment` subtype derived from the attribute's own `type`.
 *
 * `valueId` is a cross-module ref with NO FK (attribute values are hard-deleted
 * with no graft cleanup), so a value relation can be null (dangling ref). Every
 * branch null-guards and OMITS the assignment rather than asserting — a dangling
 * ref must never NPE a public read.
 */
export function groupAssigned(rows: ReadonlyArray<AssignedRow>, org: number | null): AnyAssignment[] {
  const groups = new Map<number, { attribute: AssignedRow['attribute'], rows: AssignedRow[] }>()
  for (const r of rows) {
    if (!(r.organizationId == null || r.organizationId === org))
      continue
    let g = groups.get(r.attributeId)
    if (g == null) {
      g = { attribute: r.attribute, rows: [] }
      groups.set(r.attributeId, g)
    }
    g.rows.push(r)
  }
  return [...groups.values()]
    .sort((a, b) => a.attribute.slug.localeCompare(b.attribute.slug))
    .flatMap((g): AnyAssignment[] => {
      const sorted = [...g.rows].sort((a, b) => a.position - b.position)
      const attribute = g.attribute
      const first = sorted[0]
      // The value relation to read is the attribute's own `type` — many types
      // share one relation (DROPDOWN/MULTISELECT→select, DATE/DATE_TIME→date,
      // PLAIN_TEXT/RICH_TEXT→text).
      switch (attribute.type) {
        case 'DROPDOWN':
        case 'MULTISELECT': {
          const selectValues = sorted.map(r => r.selectValue).filter((v): v is NonNullable<typeof v> => v != null)
          return selectValues.length ? [{ attribute, selectValues }] : []
        }
        case 'SWATCH': {
          const swatchValues = sorted.map(r => r.swatchValue).filter((v): v is NonNullable<typeof v> => v != null)
          return swatchValues.length ? [{ attribute, swatchValues }] : []
        }
        case 'REFERENCE': {
          const referenceValues = sorted.map(r => r.referenceValue).filter((v): v is NonNullable<typeof v> => v != null)
          return referenceValues.length ? [{ attribute, referenceValues }] : []
        }
        case 'NUMERIC': return first?.numericValue ? [{ attribute, numeric: first.numericValue.value }] : []
        case 'BOOLEAN': return first?.booleanValue ? [{ attribute, boolean: first.booleanValue.value }] : []
        case 'DATE':
        case 'DATE_TIME': return first?.dateValue ? [{ attribute, date: first.dateValue.value }] : []
        case 'PLAIN_TEXT':
        case 'RICH_TEXT': return first?.textValue ? [{ attribute, text: { plain: first.textValue.plain, rich: first.textValue.rich } }] : []
        case 'FILE': return first?.fileValue ? [{ attribute, file: { fileUrl: first.fileValue.fileUrl, mimetype: first.fileValue.mimetype } }] : []
        default: return []
      }
    })
}

/** Consumer-injected wiring shared by both `AssignedAttribute` field helpers. */
interface AssignedFieldOpts {
  /** The `pothosDrizzleSelect.with` graph that loads the attribute-value rows (+ their value relations) and anything `org` needs. */
  with: Record<string, unknown>
  /** Pull the loaded attribute-value rows off the parent row. */
  rows: (parent: any) => ReadonlyArray<AssignedRow>
  /** Resolve the org whose grafts overlay the base (base∪org filter); null for base only. */
  org: (parent: any, args: any) => number | null
  /** Extra field args (e.g. the consumer's graft selectors), merged into the field. */
  args?: Record<string, unknown>
  subGraphs?: ReadonlyArray<string>
  authScopes?: (parent: any, args: any) => unknown
  description?: string
}

/**
 * Build an `<field>: [AssignedAttribute!]!` listing the owning object's
 * attributes with typed values resolved inline.
 *
 * Usage in a consumer drizzleNode:
 *   assignedAttributes: assignedAttributesField(t, {
 *     with: { channelListings: true, attributeValues: { with: ASSIGNED_WITH } },
 *     rows: p => p.attributeValues ?? [],
 *     org: (p, args) => resolveGraftOrg(args, p.channelListings ?? []),
 *     args: { channel: t.arg.int(...), viewerOrg: t.arg.globalID(...) },
 *     authScopes: (_p, args) => graftAuthScopes(args),
 *   })
 */
export function assignedAttributesField(t: any, opts: AssignedFieldOpts) {
  return t.field({
    type: ['AssignedAttribute'],
    description: opts.description ?? 'The object\'s attributes with typed values resolved inline.',
    ...(opts.subGraphs != null ? { subGraphs: opts.subGraphs } : {}),
    ...(opts.args != null ? { args: opts.args } : {}),
    ...(opts.authScopes != null ? { authScopes: opts.authScopes } : {}),
    extensions: { pothosDrizzleSelect: { with: opts.with } },
    resolve: (parent: any, args: any) => groupAssigned(opts.rows(parent), opts.org(parent, args)),
  })
}

/**
 * Build an `<field>(slug: String!): AssignedAttribute` accessor for a single
 * assigned attribute by slug (PDP accessor). The `slug` arg is added by the
 * helper; same scoping as `assignedAttributesField`.
 */
export function assignedAttributeField(t: any, opts: AssignedFieldOpts) {
  return t.field({
    type: 'AssignedAttribute',
    nullable: true,
    description: opts.description ?? 'A single assigned attribute by slug.',
    ...(opts.subGraphs != null ? { subGraphs: opts.subGraphs } : {}),
    args: { slug: t.arg.string({ required: true, description: 'The attribute slug to fetch.' }), ...(opts.args ?? {}) },
    ...(opts.authScopes != null ? { authScopes: opts.authScopes } : {}),
    extensions: { pothosDrizzleSelect: { with: opts.with } },
    resolve: (parent: any, args: { slug: string } & Record<string, unknown>) =>
      groupAssigned(opts.rows(parent), opts.org(parent, args)).find(g => g.attribute.slug === args.slug) ?? null,
  })
}
