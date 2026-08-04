/* eslint-disable no-restricted-syntax, unicorn/no-global-object-property-assignment, unicorn/no-top-level-assignment-in-function */
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals'

const originalBuffer = Object.getOwnPropertyDescriptor(globalThis, 'Buffer')
const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto')
const originalModules = globalThis.modules
const originalProcess = Object.getOwnPropertyDescriptor(globalThis, 'process')
const originalRequire = globalThis.require

interface BufferShim {
  alloc: (size: number) => Uint8Array
  allocUnsafe: (size: number) => Uint8Array
  allocUnsafeSlow: (size: number) => Uint8Array
  readonly bigint: undefined
  byteLength: (value: unknown) => number
  compare: (left: number, right: number) => number
  concat: (values: readonly unknown[], totalLength?: number) => Uint8Array
  from: (value: string | Uint8Array, encoding?: string) => Uint8Array
  isBuffer: (value: unknown) => boolean
}

interface StreamShim {
  destroy: () => void
  emit: () => void
  end: () => void
  readonly fd: number
  readonly isTTY: boolean
  on: () => void
  once: () => void
  pause: () => void
  pipe: () => void
  read: () => null
  removeListener: () => void
  resume: () => void
  setEncoding: () => void
  unpipe: () => void
  write: () => void
}

interface ProcessShim {
  readonly arch: string
  readonly argv: readonly unknown[]
  cwd: () => string
  readonly env: Readonly<Record<string, string>>
  exit: () => void
  hrtime: {
    (time?: readonly [number, number]): [number, number]
    bigint: () => bigint
  }
  memoryUsage: () => Readonly<Record<string, number>>
  nextTick: (fn: () => void) => void
  readonly pid: number
  readonly platform: string
  readonly ppid: number
  readonly stderr: StreamShim
  readonly stdin: StreamShim
  readonly stdout: StreamShim
  readonly title: string
  uptime: () => number
  readonly version: string
  readonly versions: Readonly<Record<string, string>>
}

let bufferShim: BufferShim
let processShim: ProcessShim
let randomBytesWithoutCrypto: {
  length: number
  toString: (encoding: string) => string
}

const restoreProperty = (
  name: 'Buffer' | 'crypto' | 'process',
  descriptor: PropertyDescriptor | undefined,
): void => {
  if (descriptor) {
    Object.defineProperty(globalThis, name, descriptor)
  } else {
    Reflect.deleteProperty(globalThis, name)
  }
}

beforeAll(async () => {
  globalThis.modules = {}
  Reflect.deleteProperty(globalThis, 'require')
  Object.defineProperties(globalThis, {
    Buffer: {
      configurable: true,
      value: undefined,
      writable: true,
    },
    crypto: {
      configurable: true,
      value: undefined,
      writable: true,
    },
    process: {
      configurable: true,
      value: undefined,
      writable: true,
    },
  })

  await import('../src/NodeShimsBanner.ts')

  bufferShim = globalThis.Buffer
  processShim = globalThis.process
  randomBytesWithoutCrypto = globalThis.modules['node:crypto'].randomBytes(4)

  restoreProperty('Buffer', originalBuffer)
  restoreProperty('crypto', originalCrypto)
  restoreProperty('process', originalProcess)
})

afterAll(() => {
  restoreProperty('Buffer', originalBuffer)
  restoreProperty('crypto', originalCrypto)
  restoreProperty('process', originalProcess)
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

describe('banner Buffer fallback', () => {
  test.each([['alloc'], ['allocUnsafe'], ['allocUnsafeSlow']])(
    '%s creates a Uint8Array of the requested size',
    (method) => {
      expect(bufferShim[method](4)).toEqual(new Uint8Array(4))
    },
  )

  test('exposes the compatibility bigint property', () => {
    expect(bufferShim.bigint).toBeUndefined()
  })

  test.each([
    ['é', 2],
    [new Uint8Array([1, 2]), 2],
    [new ArrayBuffer(3), 3],
    [{}, 0],
  ])('byteLength measures supported input values', (value, expected) => {
    expect(bufferShim.byteLength(value)).toBe(expected)
  })

  test.each([
    [1, 2, -1],
    [2, 1, 1],
    [1, 1, 0],
  ])('compare(%s, %s)', (left, right, expected) => {
    expect(bufferShim.compare(left, right)).toBe(expected)
  })

  test('concat combines typed arrays and strings', () => {
    expect(
      bufferShim.concat([new Uint8Array([1]), 'A', { unsupported: true }]),
    ).toEqual(new Uint8Array([1, 65]))
  })

  test('concat honors an explicit total length', () => {
    expect(bufferShim.concat([new Uint8Array([1, 2])], 4)).toEqual(
      new Uint8Array([1, 2, 0, 0]),
    )
  })

  test('from encodes strings and preserves binary values', () => {
    expect(bufferShim.from('A', 'utf8')).toEqual(new Uint8Array([65]))
    const value = new Uint8Array([1, 2])
    expect(bufferShim.from(value)).toBe(value)
  })

  test('isBuffer reports false for the minimal shim', () => {
    expect(bufferShim.isBuffer(new Uint8Array())).toBe(false)
  })
})

describe('banner process fallback', () => {
  test('exposes stable browser process metadata', () => {
    expect(processShim.arch).toBe('x64')
    expect(processShim.argv).toEqual([])
    expect(processShim.cwd()).toBe('/')
    expect(processShim.env).toEqual({})
    expect(processShim.pid).toBe(1)
    expect(processShim.platform).toBe('browser')
    expect(processShim.ppid).toBe(0)
    expect(processShim.title).toBe('browser')
    expect(processShim.version).toBe('v0.0.0')
    expect(processShim.versions).toEqual({ node: '0.0.0' })
    expect(processShim.exit()).toBeUndefined()
  })

  test('reports elapsed high-resolution time', () => {
    const time = processShim.hrtime()
    expect(time).toHaveLength(2)
    expect(time[0]).toBeGreaterThanOrEqual(0)
    expect(time[1]).toBeGreaterThanOrEqual(0)
    expect(processShim.hrtime([0, 0])).toHaveLength(2)
    expect(typeof processShim.hrtime.bigint()).toBe('bigint')
  })

  test('reports zeroed memory usage', () => {
    expect(processShim.memoryUsage()).toEqual({
      arrayBuffers: 0,
      external: 0,
      heapTotal: 0,
      heapUsed: 0,
      rss: 0,
    })
  })

  test('schedules nextTick callbacks', async () => {
    let called = false
    await new Promise<void>((resolve) => {
      processShim.nextTick(() => {
        called = true
        resolve()
      })
    })
    expect(called).toBe(true)
  })

  test('reports non-negative uptime', () => {
    expect(processShim.uptime()).toBeGreaterThanOrEqual(0)
  })

  test.each(['stdin', 'stdout', 'stderr'])(
    '%s provides stream methods',
    (name) => {
      const stream = processShim[name]
      expect(stream.fd).toBe(0)
      expect(stream.isTTY).toBe(false)
      expect(stream.destroy()).toBeUndefined()
      expect(stream.emit()).toBeUndefined()
      expect(stream.end()).toBeUndefined()
      expect(stream.on()).toBeUndefined()
      expect(stream.once()).toBeUndefined()
      expect(stream.pause()).toBeUndefined()
      expect(stream.pipe()).toBeUndefined()
      expect(stream.read()).toBeNull()
      expect(stream.removeListener()).toBeUndefined()
      expect(stream.resume()).toBeUndefined()
      expect(stream.setEncoding()).toBeUndefined()
      expect(stream.unpipe()).toBeUndefined()
      expect(stream.write()).toBeUndefined()
    },
  )
})

test('randomBytes falls back when Web Crypto is unavailable', () => {
  expect(randomBytesWithoutCrypto).toHaveLength(4)
  expect(randomBytesWithoutCrypto.toString('hex')).toHaveLength(8)
})
