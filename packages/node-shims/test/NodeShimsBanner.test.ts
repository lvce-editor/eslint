import { afterAll, beforeAll, describe, expect, jest, test } from '@jest/globals'

const originalModules = globalThis.modules
const originalRequire = globalThis.require

beforeAll(async () => {
  globalThis.modules = { sentinel: 'preserved' }
  Reflect.deleteProperty(globalThis, 'require')
  await import('../src/NodeShimsBanner.ts')
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

describe('banner path shim', () => {
  test.each([
    ['/workspace/file.test.js', undefined, 'file.test.js'],
    ['/workspace/file.test.js', '.js', 'file.test'],
    ['/workspace/file.test.js', '.ts', 'file.test.js'],
    ['/workspace/', undefined, ''],
  ])('basename(%s, %s)', (value, extension, expected) => {
    expect(globalThis.modules['node:path'].basename(value, extension)).toBe(
      expected,
    )
  })

  test.each([
    ['/workspace/src/file.js', '/workspace/src'],
    ['file.js', '/'],
  ])('dirname(%s)', (value, expected) => {
    expect(globalThis.modules['node:path'].dirname(value)).toBe(expected)
  })

  test.each([
    ['/workspace/file.js', '.js'],
    ['/workspace.with-dot/file', ''],
  ])('extname(%s)', (value, expected) => {
    expect(globalThis.modules['node:path'].extname(value)).toBe(expected)
  })

  test.each([
    ['/workspace/file.js', true],
    ['workspace/file.js', false],
  ])('isAbsolute(%s)', (value, expected) => {
    expect(globalThis.modules['node:path'].isAbsolute(value)).toBe(expected)
  })

  test('join removes empty parts and duplicate separators', () => {
    expect(
      globalThis.modules['node:path'].join('/workspace/', '', '/src', 'a.js'),
    ).toBe('/workspace/src/a.js')
  })

  test.each([
    ['/workspace//src/./file.js', '/workspace/src/file.js'],
    ['/workspace/.', '/workspace'],
  ])('normalize(%s)', (value, expected) => {
    expect(globalThis.modules['node:path'].normalize(value)).toBe(expected)
  })

  test.each([
    ['/workspace', '/workspace', ''],
    ['/workspace/src', '/workspace/test/file.js', '../test/file.js'],
    ['/workspace', '/workspace/src/file.js', 'src/file.js'],
    ['/workspace/src/deep', '/other/file.js', '../../../other/file.js'],
  ])('relative(%s, %s)', (from, to, expected) => {
    expect(globalThis.modules['node:path'].relative(from, to)).toBe(expected)
  })

  test('resolve appends relative paths and resets at absolute paths', () => {
    expect(
      globalThis.modules['node:path'].resolve('ignored', '/workspace', 'src'),
    ).toBe('/workspace/src')
  })

  test('exposes path constants and self references', () => {
    const path = globalThis.modules['node:path']
    expect(path.delimiter).toBe(':')
    expect(path.sep).toBe('/')
    expect(path.posix).toBe(path)
    expect(path.win32).toBe(path)
  })
})

describe('banner file system shims', () => {
  test('provides file descriptor constants', () => {
    expect(globalThis.modules['node:fs'].constants).toEqual({
      O_RDONLY: 0,
      O_RDWR: 2,
      O_WRONLY: 1,
    })
  })

  test('existsSync reports files as unavailable', () => {
    expect(globalThis.modules['node:fs'].existsSync('/file')).toBe(false)
  })

  test.each([
    ['closeSync', 'fs.closeSync is not available in web worker'],
    ['openSync', 'fs.openSync is not available in web worker'],
    ['readdirSync', 'fs.readdirSync is not available in web worker'],
    ['readFileSync', 'fs.readFileSync is not available in web worker'],
    ['statSync', 'fs.statSync is not available in web worker'],
    ['writeFileSync', 'fs.writeFileSync is not available in web worker'],
  ])('%s throws a descriptive error', (method, message) => {
    expect(() => globalThis.modules['node:fs'][method]()).toThrow(message)
  })

  test('read stream exposes no-op stream methods', () => {
    const stream = globalThis.modules['node:fs'].createReadStream()
    expect(stream.fd).toBeUndefined()
    expect(stream.close()).toBeUndefined()
    expect(stream.destroy()).toBeUndefined()
    expect(stream.emit()).toBeUndefined()
    expect(stream.on()).toBeUndefined()
    expect(stream.once()).toBeUndefined()
  })

  test('write stream exposes no-op stream methods', () => {
    const stream = globalThis.modules['node:fs'].createWriteStream()
    expect(stream.fd).toBeUndefined()
    expect(stream.close()).toBeUndefined()
    expect(stream.destroy()).toBeUndefined()
    expect(stream.emit()).toBeUndefined()
    expect(stream.end()).toBeUndefined()
    expect(stream.on()).toBeUndefined()
    expect(stream.once()).toBeUndefined()
    expect(stream.write()).toBeUndefined()
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

describe('banner util shim', () => {
  test('deprecate returns the original function', () => {
    const fn = (): number => 42
    expect(globalThis.modules['node:util'].deprecate(fn, 'old')).toBe(fn)
  })

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

  test.each([
    ['isArray', [], true],
    ['isArray', {}, false],
    ['isAsyncFunction', async () => {}, true],
    ['isAsyncFunction', () => {}, false],
    ['isBigInt', 1n, true],
    ['isBigInt64Array', new BigInt64Array(1), true],
    ['isBigUint64Array', new BigUint64Array(1), true],
    ['isBoolean', false, true],
    ['isDate', new Date(0), true],
    ['isFunction', () => {}, true],
    ['isGeneratorFunction', function* generator() {}, true],
    ['isGeneratorFunction', undefined, false],
    ['isMap', new Map(), true],
    ['isNull', null, true],
    ['isNumber', 42, true],
    ['isObject', {}, true],
    ['isObject', null, false],
    ['isPromise', Promise.resolve(), true],
    ['isRegExp', /value/, true],
    ['isSet', new Set(), true],
    ['isString', 'value', true],
    ['isUndefined', undefined, true],
    ['isWeakMap', new WeakMap(), true],
    ['isWeakSet', new WeakSet(), true],
  ])('%s identifies its value', (method, value, expected) => {
    expect(globalThis.modules['node:util'].types[method](value)).toBe(expected)
  })
})

describe('banner assert and os shims', () => {
  test.each(['equal', 'strictEqual'])('%s accepts equal values', (method) => {
    expect(() => globalThis.modules['node:assert'][method](1, 1)).not.toThrow()
  })

  test.each(['equal', 'strictEqual'])('%s rejects unequal values', (method) => {
    expect(() => globalThis.modules['node:assert'][method](1, 2)).toThrow(
      'Expected 2, but got 1',
    )
  })

  test('assert methods honor custom messages', () => {
    expect(() => globalThis.modules['node:assert'].equal(1, 2, 'equal')).toThrow(
      'equal',
    )
    expect(() => globalThis.modules['node:assert'].ok(false, 'ok')).toThrow('ok')
  })

  test('ok accepts truthy values and reports falsy values', () => {
    expect(() => globalThis.modules['node:assert'].ok(true)).not.toThrow()
    expect(() => globalThis.modules['node:assert'].ok(false)).toThrow(
      'Assertion failed',
    )
  })

  test('os exposes stable browser values and a non-prefixed alias', () => {
    const os = globalThis.modules['node:os']
    expect(os.arch()).toBe('x64')
    expect(os.EOL).toBe('\n')
    expect(os.homedir()).toBe('/')
    expect(os.platform()).toBe('browser')
    expect(os.tmpdir()).toBe('/tmp')
    expect(globalThis.modules.os).toBe(os)
  })
})

describe('banner url and crypto shims', () => {
  test('converts string file URLs to paths', () => {
    expect(
      globalThis.modules['node:url'].fileURLToPath('file:///workspace/a.js'),
    ).toBe('/workspace/a.js')
  })

  test('converts URL objects to paths', () => {
    expect(
      globalThis.modules['node:url'].fileURLToPath(
        new URL('file:///workspace/a.js'),
      ),
    ).toBe('/workspace/a.js')
  })

  test('converts paths to file URLs and exposes an alias', () => {
    expect(
      globalThis.modules['node:url'].pathToFileURL('/workspace/a.js').href,
    ).toBe('file:///workspace/a.js')
    expect(globalThis.modules.url).toBe(globalThis.modules['node:url'])
  })

  test('creates deterministic string and non-string hashes', () => {
    const stringHash = globalThis.modules['node:crypto'].createHash('sha256')
    stringHash.update('value')
    const first = stringHash.digest('hex')
    expect(first).toMatch(/^[0-9a-f]+$/)

    const numberHash = globalThis.modules['node:crypto'].createHash('sha256')
    numberHash.update(42)
    expect(numberHash.digest('base64')).toMatch(/^[0-9a-f]+$/)
    expect(globalThis.modules.crypto).toBe(
      globalThis.modules['node:crypto'],
    )
  })

  test('creates buffer-like random bytes', () => {
    const bytes = globalThis.modules['node:crypto'].randomBytes(8)
    expect(bytes.length).toBe(8)
    expect(bytes.toString('hex')).toHaveLength(16)
    expect(bytes.toString('utf8')).toHaveLength(8)
  })
})

describe('banner events and module shims', () => {
  test('creates require functions from module paths', () => {
    expect(globalThis.modules['node:module']._cache).toEqual({})
    expect(globalThis.modules['node:module'].createRequire('/file.js')).toBe(
      globalThis.require,
    )
    expect(globalThis.modules.module).toBe(
      globalThis.modules['node:module'],
    )
  })

  test('event emitters add, invoke, and remove listeners', () => {
    const emitter = new globalThis.modules['node:events'].EventEmitter()
    const listener = jest.fn()
    expect(emitter.emit('event', 1)).toBe(false)
    expect(emitter.on('event', listener)).toBe(emitter)
    expect(emitter.emit('event', 1, 2)).toBe(true)
    expect(listener).toHaveBeenCalledWith(1, 2)
    expect(emitter.removeListener('event', listener)).toBe(emitter)
    expect(emitter.removeListener('event', listener)).toBe(emitter)
    expect(emitter.emit('event')).toBe(false)
    expect(globalThis.modules.events).toBe(
      globalThis.modules['node:events'],
    )
  })
})

describe('banner compatibility classes and registry', () => {
  test('provides tty and stream compatibility classes', () => {
    expect(globalThis.modules['node:tty'].isatty()).toBe(false)
    expect(new globalThis.modules['node:tty'].ReadStream()).toBeDefined()
    expect(new globalThis.modules['node:tty'].WriteStream()).toBeDefined()
    expect(globalThis.modules.tty).toBe(globalThis.modules['node:tty'])

    for (const name of [
      'Duplex',
      'PassThrough',
      'Readable',
      'Transform',
      'Writable',
    ]) {
      expect(new globalThis.modules['node:stream'][name]()).toBeDefined()
    }
    expect(globalThis.modules.stream).toBe(globalThis.modules['node:stream'])
  })

  test('reports worker thread support accurately', () => {
    const workerThreads = globalThis.modules['node:worker_threads']
    expect(workerThreads.isMainThread).toBe(false)
    expect(workerThreads.parentPort).toBeNull()
    expect(workerThreads.workerData).toBeNull()
    expect(() => new workerThreads.Worker()).toThrow(
      'Worker threads are not available in web worker',
    )
    expect(globalThis.modules.worker_threads).toBe(workerThreads)
  })

  test('preserves existing modules and provides common aliases', () => {
    expect(globalThis.modules.sentinel).toBe('preserved')
    for (const name of ['path', 'fs', 'util', 'assert']) {
      expect(globalThis.modules[name]).toBe(globalThis.modules[`node:${name}`])
    }
  })

  test('requires prefixed and non-prefixed registered modules', () => {
    expect(globalThis.require('node:path')).toBe(
      globalThis.modules['node:path'],
    )
    expect(globalThis.require('path')).toBe(globalThis.modules.path)
  })

  test('rejects unknown modules', () => {
    expect(() => globalThis.require('node:missing')).toThrow(
      "Cannot find module 'node:missing'",
    )
    expect(() => globalThis.require('missing')).toThrow(
      "Cannot find module 'missing'",
    )
  })
})
