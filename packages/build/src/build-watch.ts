import { execa } from 'execa'
import { root } from './root.js'
import { join } from 'node:path'

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
  execa(
    esbuildPath,
    [
      '--format=esm',
      '--bundle',
      '--watch',
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
