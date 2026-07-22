import { execa } from 'execa'
import { watchExtension } from './build-watch.ts'
import { root } from './root.js'

const main = async (): Promise<void> => {
  await watchExtension()

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
