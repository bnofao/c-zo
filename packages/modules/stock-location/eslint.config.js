import { config } from '@workspace/eslint-config/base'

export default config.append({
  ignores: ['src/graphql/__generated__/**'],
})
