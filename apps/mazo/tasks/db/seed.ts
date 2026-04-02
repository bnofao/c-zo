import { runSeeder } from '@czo/kit/db'
import { defineTask } from 'nitro/task'

export default defineTask({
  meta: {
    name: 'db:seed',
    description: 'Run all registered database seeders',
  },
  async run({ payload, context }) {
    const reset = payload?.reset === true || payload?.reset === 'true'
    const only = Array.isArray(payload?.only)
      ? payload.only as string[]
      : typeof payload?.only === 'string'
        ? payload.only.split(',')
        : undefined

    await runSeeder({ reset, only })

    return { result: 'Seeding complete' }
  },
})
