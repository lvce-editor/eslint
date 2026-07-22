import { execa } from 'execa'
import { root } from './root.js'

const main = async (): Promise<void> => {
  await import('./build-watch.ts')

  execa(
    'node',
    [
      'node_modules/@lvce-editor/server/bin/server.js',
      '--test-path=packages/e2e',
      '--only-extension=packages/extension',
    ],
    {
      cwd: root,
      stdio: 'inherit',
    },
  )
}

main()
