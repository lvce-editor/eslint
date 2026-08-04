/* eslint-disable no-restricted-syntax, unicorn/no-global-object-property-assignment */
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals'

const originalModules = globalThis.modules
const originalRequire = globalThis.require

beforeAll(async () => {
  globalThis.modules = { sentinel: 'preserved' }
  Reflect.deleteProperty(globalThis, 'require')
  await import('../src/NodeShims.ts')
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

describe('path shim', () => {
  test.each([
    ['/workspace/file.js', 'file.js'],
    ['/workspace/', ''],
    ['file.js', 'file.js'],
  ])('basename(%s)', (value, expected) => {
    expect(globalThis.modules['node:path'].basename(value)).toBe(expected)
  })

  test.each([
    ['/workspace/src/file.js', '/workspace/src'],
    ['file.js', '/'],
    ['/file.js', '/'],
  ])('dirname(%s)', (value, expected) => {
    expect(globalThis.modules['node:path'].dirname(value)).toBe(expected)
  })

  test.each([
    ['/workspace/file.test.js', '.js'],
    ['/workspace/file', ''],
    ['/workspace.with-dot/file', ''],
  ])('extname(%s)', (value, expected) => {
    expect(globalThis.modules['node:path'].extname(value)).toBe(expected)
  })

  test('join removes empty parts and duplicate separators', () => {
    expect(
      globalThis.modules['node:path'].join('/workspace/', '', '/src', 'a.js'),
    ).toBe('/workspace/src/a.js')
  })

  test('resolve appends relative paths', () => {
    expect(globalThis.modules['node:path'].resolve('workspace', 'src')).toBe(
      '/workspace/src',
    )
  })

  test('resolve resets at the last absolute path', () => {
    expect(
      globalThis.modules['node:path'].resolve('ignored', '/workspace', 'src'),
    ).toBe('/workspace/src')
  })

  test('exposes POSIX separators', () => {
    expect(globalThis.modules['node:path'].delimiter).toBe(':')
    expect(globalThis.modules['node:path'].sep).toBe('/')
  })
})

describe('file system shims', () => {
  test('existsSync reports files as unavailable', () => {
    expect(globalThis.modules['node:fs'].existsSync('/workspace/file.js')).toBe(
      false,
    )
  })

  test.each([
    ['readdirSync', 'fs.readdirSync is not available in web worker'],
    ['readFileSync', 'fs.readFileSync is not available in web worker'],
    ['statSync', 'fs.statSync is not available in web worker'],
    ['writeFileSync', 'fs.writeFileSync is not available in web worker'],
  ])('%s throws a descriptive error', (method, message) => {
    expect(() => globalThis.modules['node:fs'][method]()).toThrow(message)
  })

  test.each([
    ['readdir', 'fs.promises.readdir is not available in web worker'],
    ['readFile', 'fs.promises.readFile is not available in web worker'],
    ['stat', 'fs.promises.stat is not available in web worker'],
    ['writeFile', 'fs.promises.writeFile is not available in web worker'],
  ])('%s rejects with a descriptive error', async (method, message) => {
    await expect(
      globalThis.modules['node:fs/promises'][method](),
    ).rejects.toThrow(message)
  })
})

describe('util shim', () => {
  test('inspect formats values as indented JSON', () => {
    expect(globalThis.modules['node:util'].inspect({ answer: 42 })).toBe(
      '{\n  "answer": 42\n}',
    )
  })

  test('promisify resolves a synchronous result', async () => {
    const add = globalThis.modules['node:util'].promisify(
      (left: number, right: number) => left + right,
    )
    await expect(add(20, 22)).resolves.toBe(42)
  })
})

describe('assert shim', () => {
  test.each(['equal', 'strictEqual'])('%s accepts equal values', (method) => {
    expect(() => globalThis.modules['node:assert'][method](1, 1)).not.toThrow()
  })

  test.each(['equal', 'strictEqual'])(
    '%s describes unequal values',
    (method) => {
      expect(() => globalThis.modules['node:assert'][method](1, 2)).toThrow(
        'Expected 2, but got 1',
      )
    },
  )

  test('uses a custom equality message', () => {
    expect(() =>
      globalThis.modules['node:assert'].equal(1, 2, 'custom'),
    ).toThrow('custom')
  })

  test('ok accepts truthy values', () => {
    expect(() => globalThis.modules['node:assert'].ok('value')).not.toThrow()
  })

  test('ok rejects falsy values with the default message', () => {
    expect(() => globalThis.modules['node:assert'].ok(0)).toThrow(
      'Assertion failed',
    )
  })

  test('ok uses a custom message', () => {
    expect(() => globalThis.modules['node:assert'].ok(false, 'custom')).toThrow(
      'custom',
    )
  })
})

describe('os shim', () => {
  test('provides stable browser values', () => {
    const os = globalThis.modules['node:os']
    expect(os.arch()).toBe('x64')
    expect(os.EOL).toBe('\n')
    expect(os.homedir()).toBe('/')
    expect(os.platform()).toBe('browser')
    expect(os.tmpdir()).toBe('/tmp')
  })
})

describe('module registry and require shim', () => {
  test('preserves unrelated existing modules', () => {
    expect(globalThis.modules.sentinel).toBe('preserved')
  })

  test('loads registered node-prefixed modules', () => {
    expect(globalThis.require('node:path')).toBe(
      globalThis.modules['node:path'],
    )
  })

  test('rejects unknown node-prefixed modules', () => {
    expect(() => globalThis.require('node:missing')).toThrow(
      "Cannot find module 'node:missing'",
    )
  })

  test('rejects non-prefixed modules', () => {
    expect(() => globalThis.require('path')).toThrow(
      "Cannot find module 'path'",
    )
  })
})
