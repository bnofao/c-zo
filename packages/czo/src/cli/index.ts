#!/usr/bin/env node

import { createRequire } from 'node:module'
import process from 'node:process'
import { runMain } from 'citty'

import main from './commands'

const require = createRequire(import.meta.url)

async function runCommands() {
  try {
    require('ts-node').register?.({})
    require('tsconfig-paths').register?.({})
  }
  catch (e) {
    const isProduction = process.env.NODE_ENV === 'production'
    if (!isProduction) {
      console.warn(
        'ts-node cannot be loaded and used, if you are running in production don\'t forget to set your NODE_ENV to production',
      )
      console.warn(e)
    }
  }

  require('dotenv').config()
  runMain(main)
}

runCommands()
