/* eslint-disable no-restricted-syntax, unicorn/no-global-object-property-assignment */
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals'

const originalModules = globalThis.modules
const originalRequire = globalThis.require
const testModule = { value: 42 }
const testModules = { 'node:test-module': testModule }

beforeAll(async () => {
  globalThis.modules = testModules
  Reflect.deleteProperty(globalThis, 'require')
  await import('../src/RequireShim.ts')
})

afterAll(() => {
  if (originalModules === undefined) {
    Reflect.deleteProperty(globalThis, 'modules')
  } else {
    globalThis.modules = originalModules
  }
  if (originalRequire === undefined) {
    Reflect.deleteProperty(globalThis, 'require')
  } else {
    globalThis.require = originalRequire
  }
})

describe('require shim', () => {
  test('loads a registered node-prefixed module', () => {
    expect(globalThis.require('node:test-module')).toBe(testModule)
  })

  test('rejects an unknown node-prefixed module', () => {
    expect(() => globalThis.require('node:missing')).toThrow(
      "Cannot find module 'node:missing'",
    )
  })

  test('rejects a non-prefixed module', () => {
    expect(() => globalThis.require('test-module')).toThrow(
      "Cannot find module 'test-module'",
    )
  })

  test('rejects a module when the registry is unavailable', () => {
    Reflect.deleteProperty(globalThis, 'modules')
    expect(() => globalThis.require('node:test-module')).toThrow(
      "Cannot find module 'node:test-module'",
    )
    globalThis.modules = testModules
  })
})
