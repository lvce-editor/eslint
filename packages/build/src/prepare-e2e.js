import { cp, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { root } from './root.js'

const extension = join(root, 'packages', 'extension')

await mkdir(join(extension, 'dist'), { recursive: true })
await cp(
  join(root, 'dist', 'dist', 'eslintMain.js'),
  join(extension, 'dist', 'eslintMain.js'),
)
await cp(
  join(root, 'dist', 'dist', 'moduleResolutionWorkerMain.js'),
  join(extension, 'dist', 'moduleResolutionWorkerMain.js'),
)
