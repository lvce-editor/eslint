import { packageExtension } from '@lvce-editor/package-extension'
import fs from 'node:fs'
import path, { join } from 'node:path'
import {
  buildEslintEvaluationWorker,
  buildExtension,
  buildModuleResolutionWorker,
} from './build-production.ts'
import { root } from './root.js'

const extension = path.join(root, 'packages', 'extension')
const extensionOutput = join(root, 'dist', 'dist', 'eslintMain.js')
const moduleResolutionWorkerOutput = join(
  root,
  'dist',
  'dist',
  'moduleResolutionWorkerMain.js',
)
const eslintEvaluationWorkerOutput = join(
  root,
  'dist',
  'dist',
  'eslintEvaluationWorkerMain.js',
)

fs.rmSync(join(root, 'dist'), { recursive: true, force: true })

fs.mkdirSync(path.join(root, 'dist'))

fs.copyFileSync(join(root, 'README.md'), join(root, 'dist', 'README.md'))
fs.copyFileSync(
  join(extension, 'extension.json'),
  join(root, 'dist', 'extension.json'),
)
fs.cpSync(join(extension, 'media'), join(root, 'dist', 'media'), {
  recursive: true,
})
await Promise.all([
  buildEslintEvaluationWorker(eslintEvaluationWorkerOutput),
  buildExtension(extensionOutput),
  buildModuleResolutionWorker(moduleResolutionWorkerOutput),
])

await packageExtension({
  highestCompression: true,
  inDir: join(root, 'dist'),
  outFile: join(root, 'extension.tar.br'),
})
