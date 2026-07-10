import {
  bundleJs,
  packageExtension,
  replace,
} from '@lvce-editor/package-extension'
import fs from 'node:fs'
import path, { join } from 'node:path'
import { root } from './root.js'
import { rm } from 'node:fs/promises'

const extension = path.join(root, 'packages', 'extension')
const eslintWorker = path.join(root, 'packages', 'eslint-worker')
const eslintWorkerOutput = join(
  root,
  'dist',
  'eslint-worker',
  'dist',
  'eslintWorkerMain.js',
)

fs.rmSync(join(root, 'dist'), { recursive: true, force: true })

fs.mkdirSync(path.join(root, 'dist'))

fs.copyFileSync(join(root, 'README.md'), join(root, 'dist', 'README.md'))
fs.copyFileSync(
  join(extension, 'extension.json'),
  join(root, 'dist', 'extension.json'),
)
fs.cpSync(join(extension, 'src'), join(root, 'dist', 'src'), {
  recursive: true,
})

fs.mkdirSync(
  join(root, 'dist', 'eslint-worker', 'third_party', 'eslint', 'plugins'),
  {
    recursive: true,
  },
)

await replace({
  path: join(root, 'dist', 'extension.json'),
  occurrence: 'src/eslintMain.ts',
  replacement: 'dist/eslintMain.js',
})

await bundleJs(
  join(extension, 'src', 'eslintMain.ts'),
  join(root, 'dist', 'dist', 'eslintMain.js'),
  false,
)

await bundleJs(
  join(eslintWorker, 'src', 'eslintWorkerMain.ts'),
  eslintWorkerOutput,
  false,
)

// Rollup exposes esquery's CommonJS default as a namespace. ESLint expects the
// callable default export directly.
const eslintWorkerContent = fs.readFileSync(eslintWorkerOutput, 'utf8')
const patchedEslintWorkerContent = eslintWorkerContent
  .replace(
    'return esquery.parse(selector)',
    'return esquery.default.parse(selector)',
  )
  .replace(
    'return esquery.matches(node, root, ancestry, options)',
    'return esquery.default.matches(node, root, ancestry, options)',
  )
if (patchedEslintWorkerContent === eslintWorkerContent) {
  throw new Error('Could not patch esquery interop in the ESLint worker bundle')
}
fs.writeFileSync(eslintWorkerOutput, patchedEslintWorkerContent)

await rm(join(root, 'dist', 'src'), {
  recursive: true,
})

await packageExtension({
  highestCompression: true,
  inDir: join(root, 'dist'),
  outFile: join(root, 'extension.tar.br'),
})
