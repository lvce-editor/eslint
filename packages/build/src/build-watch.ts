import { execa } from 'execa'
import { root } from './root.ts'
import { join } from 'node:path'

const main = async (): Promise<void> => {
  const binaryName: string = 'esbuild'
  const esbuildPath: string = join(root, 'packages', 'build', 'node_modules', 'esbuild', 'bin', binaryName)
  execa(
    esbuildPath,
    [
      '--format=esm',
      '--bundle',
      '--watch',
      'packages/extension/src/languageFeaturesTypeScriptMain.ts',
      '--outfile=packages/extension/dist/languageFeaturesTypeScriptMain.js',
    ],
    {
      cwd: root,
      stdio: 'inherit',
    },
  )
  execa(
    esbuildPath,
    [
      '--format=esm',
      '--bundle',
      '--watch',
      'packages/typescript-worker/src/typescriptWorkerMain.ts',
      '--outfile=packages/typescript-worker/dist/typescriptWorkerMain.js',
    ],
    {
      cwd: root,
      stdio: 'inherit',
    },
  )
}

main()
