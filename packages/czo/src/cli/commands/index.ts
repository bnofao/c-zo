import path from 'node:path'
import { defineCommand } from 'citty'

export default defineCommand({
  meta: {
    name: 'czo',
    description: 'Czo CLI',
    version: '0.1.0', // TODO: get version from package.json
  },
  subCommands: () => {
    const defaultDir = path.resolve('.')
    const defaultPort = '9000'
    return {
      build: () => import('./build').then(r => r.default(defaultDir)),
      start: () => import('./start').then(r => r.default(defaultDir, defaultPort)),
      develop: () => import('./develop').then(r => r.default(defaultDir, defaultPort)),
      task: () => import('./task').then(r => r.default),
    }
  },
})
