// This code is injected as a banner by esbuild
// It sets up Node.js module shims before any other code runs
if (typeof globalThis.modules === 'undefined') {
  globalThis.modules = {}
}

// Minimal path module shim
globalThis.modules['node:path'] = {
  join: (...paths) => {
    return paths.filter(Boolean).join('/').replace(/\/+/g, '/')
  },
  dirname: (path) => {
    const parts = path.split('/')
    parts.pop()
    return parts.join('/') || '/'
  },
  basename: (path) => {
    const parts = path.split('/')
    return parts[parts.length - 1] || ''
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
  sep: '/',
  delimiter: ':',
}

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
