import { packageExtension } from '@lvce-editor/package-extension'
import fs from 'node:fs'
import path, { join } from 'node:path'
import { buildExtension } from './build-watch.ts'
import { root } from './root.js'

const extension = path.join(root, 'packages', 'extension')
const extensionOutput = join(root, 'dist', 'dist', 'eslintMain.js')

fs.rmSync(join(root, 'dist'), { recursive: true, force: true })

fs.mkdirSync(path.join(root, 'dist'))

fs.copyFileSync(join(root, 'README.md'), join(root, 'dist', 'README.md'))
fs.copyFileSync(join(extension, 'icon.png'), join(root, 'dist', 'icon.png'))
fs.copyFileSync(
  join(extension, 'extension.json'),
  join(root, 'dist', 'extension.json'),
)
await buildExtension(extensionOutput)

await packageExtension({
  highestCompression: true,
  inDir: join(root, 'dist'),
  outFile: join(root, 'extension.tar.br'),
})
