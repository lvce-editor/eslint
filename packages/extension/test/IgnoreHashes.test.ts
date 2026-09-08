import { expect, test } from '@jest/globals'
import * as IgnoreHashes from '../src/parts/IgnoreHashes/IgnoreHashes.ts'

const helloHash =
  '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'

test('matches exact UTF-8 SHA-256 content and reads updated preferences', async () => {
  IgnoreHashes.state.getPreference = async (key) => {
    expect(key).toBe('eslint.ignoreHashes')
    return [helloHash]
  }
  expect(await IgnoreHashes.isIgnored('hello')).toBe(true)
  expect(await IgnoreHashes.isIgnored('hello\n')).toBe(false)
  IgnoreHashes.state.getPreference = async () => []
  expect(await IgnoreHashes.isIgnored('hello')).toBe(false)
})

test.each([undefined, null, [], helloHash, {}, [null, 42, 'invalid']])(
  'ignores invalid or empty settings: %p',
  async (value) => {
    IgnoreHashes.state.getPreference = async () => value
    expect(await IgnoreHashes.isIgnored('hello')).toBe(false)
  },
)

test('falls back to linting when preferences are unavailable', async () => {
  IgnoreHashes.state.getPreference = async () => {
    throw new Error('unavailable')
  }
  expect(await IgnoreHashes.isIgnored('hello')).toBe(false)
})
