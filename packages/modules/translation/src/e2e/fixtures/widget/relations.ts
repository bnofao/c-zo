import type { SchemaRegistryShape } from '@czo/kit/db'
import { defineRelationsPart } from 'drizzle-orm'

type WidgetSchema = Pick<SchemaRegistryShape, 'widgets' | 'widgetTranslations'>

export function widgetRelations(schema: WidgetSchema) {
  const { widgets, widgetTranslations } = schema
  return defineRelationsPart({ widgets, widgetTranslations }, r => ({
    widgets: { translations: r.many.widgetTranslations({ from: r.widgets.id, to: r.widgetTranslations.widgetId }) },
    widgetTranslations: { widget: r.one.widgets({ from: r.widgetTranslations.widgetId, to: r.widgets.id }) },
  }))
}
export type WidgetRelations = ReturnType<typeof widgetRelations>
