#!/usr/bin/env node
import { defineCommand, runMain } from 'citty'
import { publishCommand } from './commands/publish'

const main = defineCommand({
  meta: {
    name: 'czo',
    description: 'CZO CLI Tool',
    version: '0.0.1',
  },
  subCommands: {
    publish: publishCommand,
  },
})

runMain(main)



