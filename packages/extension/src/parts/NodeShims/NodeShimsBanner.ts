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

// Make require() work for node: modules
if (typeof globalThis.require === 'undefined') {
  globalThis.require = ((id) => {
    if (id.startsWith('node:')) {
      const module = globalThis.modules[id]
      if (module) {
        return module
      }
    }
    throw new Error(`Cannot find module '${id}'`)
  })
}

