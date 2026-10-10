import { expect, test } from '@jest/globals'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

test('collects discarded runtime exports and their virtual file stores', () => {
  const fixture = fileURLToPath(
    new URL('fixtures/runtimeRetention.mjs', import.meta.url),
  )
  expect(() =>
    execFileSync(process.execPath, ['--expose-gc', fixture], {
      encoding: 'utf8',
    }),
  ).not.toThrow()
})
