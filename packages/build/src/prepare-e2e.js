import { cp, mkdir, readdir, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { root } from './root.js'

const extension = join(root, 'packages', 'extension')

await mkdir(join(extension, 'dist'), { recursive: true })
await cp(
  join(root, 'dist', 'dist', 'eslintMain.js'),
  join(extension, 'dist', 'eslintMain.js'),
)
await cp(
  join(root, 'dist', 'dist', 'eslintEvaluationWorkerMain.js'),
  join(extension, 'dist', 'eslintEvaluationWorkerMain.js'),
)
await cp(
  join(root, 'dist', 'dist', 'moduleResolutionWorkerMain.js'),
  join(extension, 'dist', 'moduleResolutionWorkerMain.js'),
)

const fixtures = join(root, 'packages', 'e2e', 'fixtures')
const fixtureEntries = await readdir(fixtures, { withFileTypes: true })
await Promise.all(
  fixtureEntries
    .filter((entry) => entry.isDirectory())
    .map(async (entry) => {
      try {
        await symlink(
          join(root, 'node_modules'),
          join(fixtures, entry.name, 'node_modules'),
          process.platform === 'win32' ? 'junction' : 'dir',
        )
      } catch (error) {
        if (
          !error ||
          typeof error !== 'object' ||
          !('code' in error) ||
          error.code !== 'EEXIST'
        ) {
          throw error
        }
      }
    }),
)
