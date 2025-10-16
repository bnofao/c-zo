import type { NestedHooks } from 'hookable'
import type { NitroHooks, NitroModule } from 'nitro/types'

export function defineNitroModule(def: NitroModule): NitroModule {
  if (typeof def?.setup !== 'function') {
    def.setup = () => {
      throw new TypeError('NitroModule must implement a `setup` method!')
    }
    return def
  }

  if (def.hooks) {
    def.setup = (nitro) => {
      nitro.hooks.addHooks(def.hooks as NestedHooks<NitroHooks>)
      def.setup(nitro)
    }
  }

  return def
}
