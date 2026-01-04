import { promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { defineCommand } from 'citty'
import { consola } from 'consola'
import { createJiti } from 'jiti'
import { resolve } from 'pathe'
import { resolveFiles, resolvePath } from '../resolve'

const jiti = createJiti(import.meta.url)

export const publishCommand = defineCommand({
  meta: {
    name: 'publish',
    description: 'Publish specific directories/files to output directory',
  },
  args: {
    dir: {
      type: 'string',
      description: 'Directory to publish',
      required: true,
    },
    config: {
      type: 'string',
      description: 'Config file to use',
      required: true,
    },
    outdir: {
      type: 'string',
      description: 'Output directory where files will be published',
      required: true,
    },
  },
  async run({ args }) {
    const cwd = process.cwd()
    const dir = args.dir
    const outDir = resolve(cwd, args.outdir)
    const config = await jiti.import(pathToFileURL(await resolvePath(args.config)).href, { default: true }) as {
      modules: string[]
    }

    // Parse directories from comma-separated string
    const dirs = [
      ...await moduleDirs(config.modules.filter(m => typeof m === 'string'), dir),
      join(cwd, dir),
    ]

    if (dirs.length === 0) {
      consola.error('No directories specified')
      process.exit(1)
    }

    consola.info(`Publishing to: ${outDir}`)

    // Ensure output directory exists
    await fs.mkdir(outDir, { recursive: true })

    let totalFiles = 0

    // Process each directory/pattern
    for (const dir of dirs) {
      const pattern = dir.includes('*') ? dir : `${dir}/**/*`
      consola.start(`Processing: ${dir}`)

      try {
        // Find all files matching the pattern
        const files = await resolveFiles(dir, pattern, { absolute: false, ignore: ['*.d.*'] })

        // Copy each file to output directory
        for (const file of files) {
          const sourcePath = resolve(dir, file)
          const destPath = resolve(cwd, outDir, file)

          // Ensure destination directory exists
          await fs.mkdir(dirname(destPath), { recursive: true })

          // Copy file
          await fs.copyFile(sourcePath, destPath)
          totalFiles++
        }

        consola.success(`Processed ${files.length} files from ${dir}`)
      }
      catch (error) {
        consola.error(`Failed to process ${dir}:`, error)
      }
    }

    consola.success(`Published ${totalFiles} files to ${outDir}`)
  },
})

async function moduleDirs(modules: string[], dir: string): Promise<string[]> {
  return await Promise.all(modules.map(async module => resolve(await resolvePath(module), '..', dir)))
}
