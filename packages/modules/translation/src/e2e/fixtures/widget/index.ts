/**
 * Test-only fixture consumer of `@czo/translation`. Defines a `widgets` entity
 * with a `widget_translations` pivot and a `Widget` drizzleNode whose `name`
 * field is built with `translatedField` — proving the overlay end-to-end.
 *
 * This module has no service: its `layer` is `Layer.empty`. It contributes a
 * schema + relations (so the merged RQB relations resolve `widgets.translations`)
 * and registers the `Widget` node + `widgets` connection.
 */
import type { Layer as LayerT } from 'effect'
import { defineModule } from '@czo/kit/module'
import { Layer } from 'effect'
import { widgetRelations } from './relations'
import * as widgetSchema from './schema'
import { registerWidgetTypes } from './types'

export default defineModule(() => ({
  name: 'widget-fixture',
  version: '0.0.1',
  layer: Layer.empty as unknown as LayerT.Layer<never, never, never>,
  db: {
    schema: widgetSchema as unknown as Record<string, unknown>,
    relations: widgetRelations,
  },
  graphql: {
    contribution: (builder: unknown) => registerWidgetTypes(builder),
  },
}))
