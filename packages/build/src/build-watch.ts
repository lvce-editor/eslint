import { execa } from 'execa'
import { root } from './root.js'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'

const main = async (): Promise<void> => {
  const binaryName: string = 'esbuild'
  const esbuildPath: string = join(
    root,
    'packages',
    'build',
    'node_modules',
    'esbuild',
    'bin',
    binaryName,
  )
  const bannerPath = join(
    root,
    'packages',
    'extension',
    'src',
    'parts',
    'NodeShims',
    'NodeShimsBanner.ts',
  )

  const bannerCode = readFileSync(bannerPath, 'utf-8')

  execa(
    esbuildPath,
    [
      '--format=esm',
      '--bundle',
      '--watch',
      '--banner:js=' + JSON.stringify(bannerCode),
      '--external:node:*',
      'packages/extension/src/eslintMain.ts',
      '--outfile=packages/extension/dist/eslintMain.js',
    ],
    {
      cwd: root,
      stdio: 'inherit',
    },
  )
}

main()
