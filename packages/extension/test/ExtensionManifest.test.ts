import { expect, test } from '@jest/globals'
import { existsSync, readFileSync } from 'node:fs'

const extension = JSON.parse(
  readFileSync(new URL('../extension.json', import.meta.url), 'utf8'),
) as { icon?: string }

test('includes the extension icon', () => {
  expect(extension.icon).toBe('./icon.png')
  expect(existsSync(new URL('../icon.png', import.meta.url))).toBe(true)
})
