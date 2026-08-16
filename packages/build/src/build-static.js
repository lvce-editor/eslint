import { cp } from 'node:fs/promises'
import path, { join } from 'node:path'
import { root } from './root.js'
import { pathToFileURL } from 'node:url'
import { removeFixtureNodeModules } from './remove-fixture-node-modules.js'

await import('./build.js')
const sharedProcessPath = join(
  root,
  'node_modules',
  '@lvce-editor',
  'shared-process',
  'index.js',
)

const sharedProcessUrl = pathToFileURL(sharedProcessPath).toString()

const sharedProcess = await import(sharedProcessUrl)
const { exportStatic } = sharedProcess

await removeFixtureNodeModules(join(root, 'packages', 'e2e', 'fixtures'))

await cp(path.join(root, 'dist'), path.join(root, 'dist2'), {
  recursive: true,
  force: true,
})

const { commitHash } = await exportStatic({
  extensionPath: 'packages/extension',
  testPath: 'packages/e2e',
  root,
})

await cp(
  path.join(root, 'dist2'),
  path.join(root, 'dist', commitHash, 'extensions', 'builtin.eslint'),
  { recursive: true, force: true },
)
