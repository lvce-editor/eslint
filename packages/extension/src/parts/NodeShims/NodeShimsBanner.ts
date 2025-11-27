// This code is injected as a banner by esbuild
// It sets up Node.js module shims before any other code runs
if (typeof globalThis.modules === 'undefined') {
  globalThis.modules = {}
}

// Minimal path module shim
const pathModule = {
  join: (...paths) => {
    return paths.filter(Boolean).join('/').replace(/\/+/g, '/')
  },
  dirname: (path) => {
    const parts = path.split('/')
    parts.pop()
    return parts.join('/') || '/'
  },
  basename: (path, ext) => {
    const parts = path.split('/')
    let name = parts[parts.length - 1] || ''
    if (ext && name.endsWith(ext)) {
      name = name.slice(0, -ext.length)
    }
    return name
  },
  extname: (path) => {
    const lastDot = path.lastIndexOf('.')
    const lastSlash = path.lastIndexOf('/')
    return lastDot > lastSlash ? path.slice(lastDot) : ''
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
    return resolved.replace(/\/+/g, '/')
  },
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
  normalize: (path) => {
    return path.replace(/\/+/g, '/').replace(/\/\.\//g, '/').replace(/\/\.$/, '')
  },
  isAbsolute: (path) => {
    return path.startsWith('/')
  },
  sep: '/',
  delimiter: ':',
  posix: null, // Will be set below
  win32: null, // Will be set below
}

// posix and win32 are references to the same object in Node.js
pathModule.posix = pathModule
pathModule.win32 = pathModule

globalThis.modules['node:path'] = pathModule

// Minimal fs module shim
globalThis.modules['node:fs'] = {
  existsSync: () => false,
  readFileSync: () => {
    throw new Error('fs.readFileSync is not available in web worker')
  },
  writeFileSync: () => {
    throw new Error('fs.writeFileSync is not available in web worker')
  },
  statSync: () => {
    throw new Error('fs.statSync is not available in web worker')
  },
  readdirSync: () => {
    throw new Error('fs.readdirSync is not available in web worker')
  },
  createReadStream: () => {
    return {
      fd: undefined,
      on: () => {},
      once: () => {},
      emit: () => {},
      destroy: () => {},
      close: () => {},
    }
  },
  createWriteStream: () => {
    return {
      fd: undefined,
      write: () => {},
      end: () => {},
      on: () => {},
      once: () => {},
      emit: () => {},
      destroy: () => {},
      close: () => {},
    }
  },
  openSync: () => {
    throw new Error('fs.openSync is not available in web worker')
  },
  closeSync: () => {
    throw new Error('fs.closeSync is not available in web worker')
  },
  constants: {
    O_RDONLY: 0,
    O_WRONLY: 1,
    O_RDWR: 2,
  },
}

// Minimal fs/promises shim
globalThis.modules['node:fs/promises'] = {
  readFile: async () => {
    throw new Error('fs.promises.readFile is not available in web worker')
  },
  writeFile: async () => {
    throw new Error('fs.promises.writeFile is not available in web worker')
  },
  stat: async () => {
    throw new Error('fs.promises.stat is not available in web worker')
  },
  readdir: async () => {
    throw new Error('fs.promises.readdir is not available in web worker')
  },
}

// Minimal util module shim
globalThis.modules['node:util'] = {
  promisify: (fn) => {
    return (...args) => {
      return Promise.resolve(fn(...args))
    }
  },
  inspect: (obj) => {
    return JSON.stringify(obj, null, 2)
  },
  deprecate: (fn, message) => {
    // Return the function as-is, optionally logging deprecation warning
    return fn
  },
  types: {
    isString: (value) => typeof value === 'string',
    isNumber: (value) => typeof value === 'number',
    isBoolean: (value) => typeof value === 'boolean',
    isUndefined: (value) => value === undefined,
    isNull: (value) => value === null,
    isObject: (value) => typeof value === 'object' && value !== null,
    isArray: (value) => Array.isArray(value),
    isFunction: (value) => typeof value === 'function',
    isBigInt: (value) => typeof value === 'bigint',
    isBigInt64Array: (value) => value instanceof BigInt64Array,
    isBigUint64Array: (value) => value instanceof BigUint64Array,
    isDate: (value) => value instanceof Date,
    isRegExp: (value) => value instanceof RegExp,
    isMap: (value) => value instanceof Map,
    isSet: (value) => value instanceof Set,
    isWeakMap: (value) => value instanceof WeakMap,
    isWeakSet: (value) => value instanceof WeakSet,
    isPromise: (value) => value instanceof Promise,
    isAsyncFunction: (value) => {
      return (
        typeof value === 'function' &&
        value.constructor &&
        value.constructor.name === 'AsyncFunction'
      )
    },
    isGeneratorFunction: (value) => {
      return (
        typeof value === 'function' &&
        value.constructor &&
        value.constructor.name === 'GeneratorFunction'
      )
    },
  },
}

// Minimal assert module shim
globalThis.modules['node:assert'] = {
  ok: (value, message) => {
    if (!value) {
      throw new Error(message || 'Assertion failed')
    }
  },
  equal: (actual, expected, message) => {
    if (actual !== expected) {
      throw new Error(message || `Expected ${expected}, but got ${actual}`)
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
  platform: () => 'browser',
  arch: () => 'x64',
  tmpdir: () => '/tmp',
  homedir: () => '/',
  EOL: '\n',
}
globalThis.modules['os'] = globalThis.modules['node:os']

// Minimal url module shim
globalThis.modules['node:url'] = {
  pathToFileURL: (path) => {
    return new URL(`file://${path}`)
  },
  fileURLToPath: (url) => {
    if (typeof url === 'string') {
      return url.replace('file://', '')
    }
    return url.pathname
  },
}
globalThis.modules['url'] = globalThis.modules['node:url']

// Minimal crypto module shim
globalThis.modules['node:crypto'] = {
  createHash: (algorithm) => {
    // Minimal hash implementation
    let hash = 0
    return {
      update: (data) => {
        const str = typeof data === 'string' ? data : String(data)
        for (let i = 0; i < str.length; i++) {
          hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
        }
        return this
      },
      digest: (encoding) => {
        const hex = Math.abs(hash).toString(16)
        if (encoding === 'hex') {
          return hex
        }
        // For other encodings, return hex as string
        return hex
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
      toString: (encoding) => {
        if (encoding === 'hex') {
          return Array.from(array)
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('')
        }
        return String.fromCharCode(...array)
      },
      length: array.length,
    }
  },
}
globalThis.modules['crypto'] = globalThis.modules['node:crypto']

// Minimal module shim
globalThis.modules['node:module'] = {
  createRequire: (filename) => {
    return globalThis.require
  },
  _cache: {},
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
      if (index > -1) {
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
  Readable: class {},
  Writable: class {},
  Transform: class {},
  Duplex: class {},
  PassThrough: class {},
}
globalThis.modules['stream'] = globalThis.modules['node:stream']

// Minimal buffer shim (use global Buffer if available, otherwise create minimal shim)
if (typeof Buffer === 'undefined') {
  globalThis.Buffer = {
    from: (data, encoding) => {
      if (typeof data === 'string') {
        return new TextEncoder().encode(data)
      }
      return data
    },
    isBuffer: () => false,
    alloc: (size) => new Uint8Array(size),
    allocUnsafe: (size) => new Uint8Array(size),
    allocUnsafeSlow: (size) => new Uint8Array(size),
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
      const total = totalLength || arrays.reduce((sum, arr) => sum + arr.length, 0)
      const result = new Uint8Array(total)
      let offset = 0
      for (const arr of arrays) {
        result.set(arr, offset)
        offset += arr.length
      }
      return result
    },
    // Add bigint property for compatibility
    bigint: undefined,
  }
}

// Minimal process shim
if (typeof process === 'undefined') {
  const createStream = (name) => ({
    fd: 0,
    isTTY: false,
    write: () => {},
    end: () => {},
    on: () => {},
    once: () => {},
    emit: () => {},
    removeListener: () => {},
    read: () => null,
    setEncoding: () => {},
    pause: () => {},
    resume: () => {},
    pipe: () => {},
    unpipe: () => {},
    destroy: () => {},
  })

  globalThis.process = {
    env: {},
    platform: 'browser',
    version: 'v0.0.0',
    versions: {},
    exit: () => {},
    cwd: () => '/',
    nextTick: (fn) => {
      setTimeout(fn, 0)
    },
    stdin: createStream('stdin'),
    stdout: createStream('stdout'),
    stderr: createStream('stderr'),
    argv: [],
    pid: 1,
    ppid: 0,
    title: 'browser',
    arch: 'x64',
    memoryUsage: () => ({
      rss: 0,
      heapTotal: 0,
      heapUsed: 0,
      external: 0,
      arrayBuffers: 0,
    }),
  }
}

// Minimal worker_threads module shim
globalThis.modules['node:worker_threads'] = {
  Worker: class Worker {
    constructor() {
      throw new Error('Worker threads are not available in web worker')
    }
  },
  isMainThread: false,
  parentPort: null,
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
  globalThis.require = ((id) => {
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
  })
}
