/* eslint-disable unicorn/no-global-object-property-assignment */
// Node.js module shims for web worker environment
// These provide minimal implementations of Node.js built-in modules
// that ESLint and plugins may require

if (globalThis.modules === undefined) {
  globalThis.modules = {}
}

// Minimal path module shim
globalThis.modules['node:path'] = {
  basename: (path: string): string => {
    const parts = path.split('/')
    return parts.at(-1) || ''
  },
  delimiter: ':',
  dirname: (path: string): string => {
    const parts = path.split('/')
    parts.pop()
    return parts.join('/') || '/'
  },
  extname: (path: string): string => {
    const lastDot = path.lastIndexOf('.')
    const lastSlash = path.lastIndexOf('/')
    return lastDot > lastSlash ? path.slice(lastDot) : ''
  },
  join: (...paths: string[]): string => {
    return paths.filter(Boolean).join('/').replaceAll(/\/+/g, '/')
  },
  resolve: (...paths: string[]): string => {
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
}

// Minimal fs module shim
globalThis.modules['node:fs'] = {
  existsSync: (): boolean => {
    return false
  },
  readdirSync: (): never => {
    throw new Error('fs.readdirSync is not available in web worker')
  },
  readFileSync: (): never => {
    throw new Error('fs.readFileSync is not available in web worker')
  },
  statSync: (): never => {
    throw new Error('fs.statSync is not available in web worker')
  },
  writeFileSync: (): never => {
    throw new Error('fs.writeFileSync is not available in web worker')
  },
}

// Minimal fs/promises shim
globalThis.modules['node:fs/promises'] = {
  readdir: async (): Promise<never> => {
    throw new Error('fs.promises.readdir is not available in web worker')
  },
  readFile: async (): Promise<never> => {
    throw new Error('fs.promises.readFile is not available in web worker')
  },
  stat: async (): Promise<never> => {
    throw new Error('fs.promises.stat is not available in web worker')
  },
  writeFile: async (): Promise<never> => {
    throw new Error('fs.promises.writeFile is not available in web worker')
  },
}

// Minimal util module shim
globalThis.modules['node:util'] = {
  inspect: (obj: unknown): string => {
    return JSON.stringify(obj, null, 2)
  },
  promisify: <T extends (...args: unknown[]) => unknown>(
    fn: T,
  ): ((...args: Parameters<T>) => Promise<ReturnType<T>>) => {
    return (...args: Parameters<T>) => {
      return Promise.resolve(fn(...args) as ReturnType<T>)
    }
  },
}

// Minimal assert module shim
globalThis.modules['node:assert'] = {
  equal: (actual: unknown, expected: unknown, message?: string): void => {
    if (actual !== expected) {
      throw new Error(message || `Expected ${expected}, but got ${actual}`)
    }
  },
  ok: (value: unknown, message?: string): void => {
    if (!value) {
      throw new Error(message || 'Assertion failed')
    }
  },
  strictEqual: (actual: unknown, expected: unknown, message?: string): void => {
    if (actual !== expected) {
      throw new Error(message || `Expected ${expected}, but got ${actual}`)
    }
  },
}

// Minimal os module shim
globalThis.modules['node:os'] = {
  arch: (): string => 'x64',
  EOL: '\n',
  homedir: (): string => '/',
  platform: (): string => 'browser',
  tmpdir: (): string => '/tmp',
}

// Make require() work for node: modules
if (globalThis.require === undefined) {
  globalThis.require = ((id: string) => {
    if (id.startsWith('node:')) {
      const module = globalThis.modules[id]
      if (module) {
        return module
      }
    }
    throw new Error(`Cannot find module '${id}'`)
    // @ts-ignore
  }) as NodeRequire
}
