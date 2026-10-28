import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

for (const [workspace, name] of [
  ['e2e', 'playwright-core'],
  ['benchmark', 'playwright'],
]) {
  const require = createRequire(
    new URL(`../packages/${workspace}/package.json`, import.meta.url),
  )
  const cli = join(dirname(require.resolve(`${name}/package.json`)), 'cli.js')
  execFileSync(process.execPath, [cli, 'install', 'chromium'], {
    stdio: 'inherit',
  })
}
