import { build } from 'esbuild'
import { cp, mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { root } from './root.js'

const extension = join(root, 'packages', 'extension')

await mkdir(join(extension, 'dist'), { recursive: true })
await cp(
  join(root, 'dist', 'dist', 'eslintMain.js'),
  join(extension, 'dist', 'eslintMain.js'),
)

const eslintFixture = join(
  root,
  'packages',
  'e2e',
  'fixtures',
  'eslint-project',
  'node_modules',
  'eslint',
)
await rm(eslintFixture, { force: true, recursive: true })
await mkdir(eslintFixture, { recursive: true })
await build({
  bundle: true,
  format: 'cjs',
  minify: true,
  outfile: join(eslintFixture, 'index.cjs'),
  platform: 'node',
  stdin: {
    contents: `module.exports = require('eslint')`,
    resolveDir: root,
    sourcefile: 'eslint-fixture.cjs',
  },
})
await writeFile(
  join(eslintFixture, 'package.json'),
  `${JSON.stringify({ main: 'index.cjs', name: 'eslint' }, null, 2)}\n`,
)
