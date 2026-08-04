import fs from 'node:fs'
import path from 'node:path'

const rules: Record<string, unknown> = {}

await Promise.all(
  fs
    .readdirSync(import.meta.dirname)
    .filter((file) => file.startsWith('no-') && file.endsWith('.ts'))
    .map(async (file) => {
      rules[path.basename(file, '.ts')] = (await import(`./${file}`)).default
    }),
)

export { rules }
