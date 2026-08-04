/* eslint-disable no-restricted-syntax, unicorn/no-global-object-property-assignment */
import { afterAll, beforeAll, expect, test } from '@jest/globals'

const originalRequire = globalThis.require
const existingRequire = (id: string): string => `existing:${id}`

beforeAll(async () => {
  globalThis.require = existingRequire
  await import('../src/RequireShim.ts')
})

afterAll(() => {
  if (originalRequire === undefined) {
    Reflect.deleteProperty(globalThis, 'require')
  } else {
    globalThis.require = originalRequire
  }
})

test('preserves an existing require function', () => {
  expect(globalThis.require).toBe(existingRequire)
  expect(globalThis.require('value')).toBe('existing:value')
})
