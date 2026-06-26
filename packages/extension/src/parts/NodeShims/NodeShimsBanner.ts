/* eslint-disable @typescript-eslint/no-implied-eval */
/* eslint-disable unicorn/no-global-object-property-assignment */
/* eslint-disable unicorn/no-this-outside-of-class */
/* eslint-disable unicorn/prefer-code-point */
// This code is injected as a banner by esbuild
// It sets up Node.js module shims before any other code runs
if (globalThis.modules === undefined) {
  globalThis.modules = {}
}

// Minimal path module shim
const pathModule = {
  basename: (path, ext) => {
    const parts = path.split('/')
    let name = parts.at(-1) || ''
    if (ext && name.endsWith(ext)) {
      name = name.slice(0, -ext.length)
    }
    return name
  },
  delimiter: ':',
  dirname: (path) => {
    const parts = path.split('/')
    parts.pop()
    return parts.join('/') || '/'
  },
  extname: (path) => {
    const lastDot = path.lastIndexOf('.')
    const lastSlash = path.lastIndexOf('/')
    return lastDot > lastSlash ? path.slice(lastDot) : ''
  },
  isAbsolute: (path) => {
    return path.startsWith('/')
  },
  join: (...paths) => {
    return paths.filter(Boolean).join('/').replaceAll(/\/+/g, '/')
  },
  normalize: (path) => {
    return path
      .replaceAll(/\/+/g, '/')
      .replaceAll('/./', '/')
      .replace(/\/\.$/, '')
  },
  posix: null, // Will be set below
  relative: (from, to) => {
    // Simplified relative path calculation
    if (from === to) return ''
    const fromParts = from.split('/').filter(Boolean)
    const toParts = to.split('/').filter(Boolean)
    let commonLength = 0
    for (let i = 0; i < Math.min(fromParts.length, toParts.length); i++) {
      if (fromParts[i] === toParts[i]) {
        commonLength++
      } else {
        break
      }
    }
    const upLevels = fromParts.length - commonLength
    const downPath = toParts.slice(commonLength).join('/')
    return '../'.repeat(upLevels) + downPath
  },
  resolve: (...paths) => {
    let resolved = '/'
    for (const path of paths) {
      if (path.startsWith('/')) {
        resolved = path
      } else {
        resolved = resolved === '/' ? `/${path}` : `${resolved}/${path}`
      }
    }
    return resolved.replaceAll(/\/+/g, '/')
  },
  sep: '/',
  win32: null, // Will be set below
}

// posix and win32 are references to the same object in Node.js
// @ts-ignore
pathModule.posix = pathModule
// @ts-ignore
pathModule.win32 = pathModule

globalThis.modules['node:path'] = pathModule

// Minimal fs module shim
globalThis.modules['node:fs'] = {
  closeSync: () => {
    throw new Error('fs.closeSync is not available in web worker')
  },
  constants: {
    O_RDONLY: 0,
    O_RDWR: 2,
    O_WRONLY: 1,
  },
  createReadStream: () => {
    return {
      close: () => {},
      destroy: () => {},
      emit: () => {},
      fd: undefined,
      on: () => {},
      once: () => {},
    }
  },
  createWriteStream: () => {
    return {
      close: () => {},
      destroy: () => {},
      emit: () => {},
      end: () => {},
      fd: undefined,
      on: () => {},
      once: () => {},
      write: () => {},
    }
  },
  existsSync: () => false,
  openSync: () => {
    throw new Error('fs.openSync is not available in web worker')
  },
  readdirSync: () => {
    throw new Error('fs.readdirSync is not available in web worker')
  },
  readFileSync: () => {
    throw new Error('fs.readFileSync is not available in web worker')
  },
  statSync: () => {
    throw new Error('fs.statSync is not available in web worker')
  },
  writeFileSync: () => {
    throw new Error('fs.writeFileSync is not available in web worker')
  },
}

// Minimal fs/promises shim
globalThis.modules['node:fs/promises'] = {
  readdir: async () => {
    throw new Error('fs.promises.readdir is not available in web worker')
  },
  readFile: async () => {
    throw new Error('fs.promises.readFile is not available in web worker')
  },
  stat: async () => {
    throw new Error('fs.promises.stat is not available in web worker')
  },
  writeFile: async () => {
    throw new Error('fs.promises.writeFile is not available in web worker')
  },
}

// Minimal util module shim
globalThis.modules['node:util'] = {
  deprecate: (fn, message) => {
    // Return the function as-is, optionally logging deprecation warning
    return fn
  },
  inspect: (obj) => {
    return JSON.stringify(obj, null, 2)
  },
  promisify: (fn) => {
    return (...args) => {
      return Promise.resolve(fn(...args))
    }
  },
  types: {
    isArray: (value) => Array.isArray(value),
    isAsyncFunction: (value) => {
      return (
        typeof value === 'function' &&
        value.constructor &&
        value.constructor.name === 'AsyncFunction'
      )
    },
    isBigInt: (value) => typeof value === 'bigint',
    isBigInt64Array: (value) => value instanceof BigInt64Array,
    isBigUint64Array: (value) => value instanceof BigUint64Array,
    isBoolean: (value) => typeof value === 'boolean',
    isDate: (value) => value instanceof Date,
    isFunction: (value) => typeof value === 'function',
    isGeneratorFunction: (value) => {
      return (
        typeof value === 'function' &&
        value.constructor &&
        value.constructor.name === 'GeneratorFunction'
      )
    },
    isMap: (value) => value instanceof Map,
    isNull: (value) => value === null,
    isNumber: (value) => typeof value === 'number',
    isObject: (value) => typeof value === 'object' && value !== null,
    isPromise: (value) => value instanceof Promise,
    isRegExp: (value) => value instanceof RegExp,
    isSet: (value) => value instanceof Set,
    isString: (value) => typeof value === 'string',
    isUndefined: (value) => value === undefined,
    isWeakMap: (value) => value instanceof WeakMap,
    isWeakSet: (value) => value instanceof WeakSet,
  },
}

// Minimal assert module shim
globalThis.modules['node:assert'] = {
  equal: (actual, expected, message) => {
    if (actual !== expected) {
      throw new Error(message || `Expected ${expected}, but got ${actual}`)
    }
  },
  ok: (value, message) => {
    if (!value) {
      throw new Error(message || 'Assertion failed')
    }
  },
  strictEqual: (actual, expected, message) => {
    if (actual !== expected) {
      throw new Error(message || `Expected ${expected}, but got ${actual}`)
    }
  },
}

// Minimal os module shim
globalThis.modules['node:os'] = {
  arch: () => 'x64',
  EOL: '\n',
  homedir: () => '/',
  platform: () => 'browser',
  tmpdir: () => '/tmp',
}
globalThis.modules['os'] = globalThis.modules['node:os']

// Minimal url module shim
globalThis.modules['node:url'] = {
  fileURLToPath: (url) => {
    if (typeof url === 'string') {
      return url.replace('file://', '')
    }
    return url.pathname
  },
  pathToFileURL: (path) => {
    return new URL(`file://${path}`)
  },
}
globalThis.modules['url'] = globalThis.modules['node:url']

// Minimal crypto module shim
globalThis.modules['node:crypto'] = {
  createHash: (algorithm) => {
    // Minimal hash implementation
    let hash = 0
    return {
      digest: (encoding) => {
        const hex = Math.abs(hash).toString(16)
        if (encoding === 'hex') {
          return hex
        }
        // For other encodings, return hex as string
        return hex
      },
      update: (data) => {
        const str = typeof data === 'string' ? data : String(data)
        for (let i = 0; i < str.length; i++) {
          hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
        }
        return this
      },
    }
  },
  randomBytes: (size) => {
    const array = new Uint8Array(size)
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(array)
    } else {
      for (let i = 0; i < size; i++) {
        array[i] = Math.floor(Math.random() * 256)
      }
    }
    // Return a Buffer-like object
    return {
      length: array.length,
      toString: (encoding) => {
        if (encoding === 'hex') {
          return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join(
            '',
          )
        }
        return String.fromCharCode(...array)
      },
    }
  },
}
globalThis.modules['crypto'] = globalThis.modules['node:crypto']

// Minimal module shim
globalThis.modules['node:module'] = {
  _cache: {},
  createRequire: (filename) => {
    return globalThis.require
  },
}
globalThis.modules['module'] = globalThis.modules['node:module']

// Minimal events shim
globalThis.modules['node:events'] = {
  EventEmitter: class EventEmitter {
    listeners = new Map()
    on(event, listener) {
      if (!this.listeners.has(event)) {
        this.listeners.set(event, [])
      }
      this.listeners.get(event).push(listener)
      return this
    }
    emit(event, ...args) {
      const listeners = this.listeners.get(event) || []
      for (const listener of listeners) {
        listener(...args)
      }
      return listeners.length > 0
    }
    removeListener(event, listener) {
      const listeners = this.listeners.get(event) || []
      const index = listeners.indexOf(listener)
      if (index !== -1) {
        listeners.splice(index, 1)
      }
      return this
    }
  },
}
globalThis.modules['events'] = globalThis.modules['node:events']

// Minimal tty module shim
globalThis.modules['node:tty'] = {
  isatty: () => false,
  ReadStream: class {},
  WriteStream: class {},
}
globalThis.modules['tty'] = globalThis.modules['node:tty']

// Minimal stream module shim
globalThis.modules['node:stream'] = {
  Duplex: class {},
  PassThrough: class {},
  Readable: class {},
  Transform: class {},
  Writable: class {},
}
globalThis.modules['stream'] = globalThis.modules['node:stream']

// Minimal buffer shim (use global Buffer if available, otherwise create minimal shim)
// @ts-ignore
if (typeof Buffer === 'undefined') {
  globalThis.Buffer = {
    alloc: (size) => new Uint8Array(size),
    allocUnsafe: (size) => new Uint8Array(size),
    allocUnsafeSlow: (size) => new Uint8Array(size),
    // Add bigint property for compatibility
    bigint: undefined,
    byteLength: (data) => {
      if (typeof data === 'string') {
        return new TextEncoder().encode(data).length
      }
      if (data instanceof ArrayBuffer) {
        return data.byteLength
      }
      if (data instanceof Uint8Array) {
        return data.length
      }
      return 0
    },
    compare: (a, b) => {
      // Simple comparison
      if (a < b) return -1
      if (a > b) return 1
      return 0
    },
    concat: (list, totalLength) => {
      const arrays = list.map((item) => {
        if (item instanceof Uint8Array) return item
        if (typeof item === 'string') return new TextEncoder().encode(item)
        return new Uint8Array(0)
      })
      const total =
        totalLength || arrays.reduce((sum, arr) => sum + arr.length, 0)
      const result = new Uint8Array(total)
      let offset = 0
      for (const arr of arrays) {
        result.set(arr, offset)
        offset += arr.length
      }
      return result
    },
    from: (data, encoding) => {
      if (typeof data === 'string') {
        return new TextEncoder().encode(data)
      }
      return data
    },
    isBuffer: () => false,
  }
}

// Minimal process shim
// @ts-ignore
if (typeof process === 'undefined') {
  const createStream = (name) => ({
    destroy: () => {},
    emit: () => {},
    end: () => {},
    fd: 0,
    isTTY: false,
    on: () => {},
    once: () => {},
    pause: () => {},
    pipe: () => {},
    read: () => null,
    removeListener: () => {},
    resume: () => {},
    setEncoding: () => {},
    unpipe: () => {},
    write: () => {},
  })

  const startTime = Date.now()
  const startHrtime = performance.now()

  globalThis.process = {
    arch: 'x64',
    argv: [],
    cwd: () => '/',
    env: {},
    exit: () => {},
    hrtime: (time) => {
      // Returns [seconds, nanoseconds]
      const now = performance.now()
      const elapsed = now - startHrtime
      const seconds = Math.floor(elapsed / 1000)
      const nanoseconds = Math.floor((elapsed % 1000) * 1_000_000)
      if (time) {
        // If previous time is provided, return difference
        const prevSeconds = time[0]
        const prevNanoseconds = time[1]
        const diffSeconds = seconds - prevSeconds
        const diffNanoseconds = nanoseconds - prevNanoseconds
        return [diffSeconds, diffNanoseconds]
      }
      return [seconds, nanoseconds]
    },
    memoryUsage: () => ({
      arrayBuffers: 0,
      external: 0,
      heapTotal: 0,
      heapUsed: 0,
      rss: 0,
    }),
    nextTick: (fn) => {
      setTimeout(fn, 0)
    },
    pid: 1,
    platform: 'browser',
    ppid: 0,
    stderr: createStream('stderr'),
    stdin: createStream('stdin'),
    stdout: createStream('stdout'),
    title: 'browser',
    uptime: () => {
      return (Date.now() - startTime) / 1000
    },
    version: 'v0.0.0',
    versions: {},
  }

  // Add hrtime.bigint property
  globalThis.process.hrtime.bigint = () => {
    const now = performance.now()
    const elapsed = now - startHrtime
    const nanoseconds = BigInt(Math.floor(elapsed * 1_000_000))
    return nanoseconds
  }
}

// Minimal worker_threads module shim
globalThis.modules['node:worker_threads'] = {
  isMainThread: false,
  parentPort: null,
  Worker: class Worker {
    constructor() {
      throw new Error('Worker threads are not available in web worker')
    }
  },
  workerData: null,
}
globalThis.modules['worker_threads'] = globalThis.modules['node:worker_threads']

// Also alias non-prefixed versions
globalThis.modules['path'] = globalThis.modules['node:path']
globalThis.modules['fs'] = globalThis.modules['node:fs']
globalThis.modules['util'] = globalThis.modules['node:util']
globalThis.modules['assert'] = globalThis.modules['node:assert']

// Make require() work for both node: and non-prefixed modules
if (globalThis.require === undefined) {
  globalThis.require = (id) => {
    // Handle node: prefix
    if (id.startsWith('node:')) {
      const module = globalThis.modules[id]
      if (module) {
        return module
      }
    }
    // Handle non-prefixed built-in modules
    const module = globalThis.modules[id]
    if (module) {
      return module
    }
    throw new Error(`Cannot find module '${id}'`)
  }
}
