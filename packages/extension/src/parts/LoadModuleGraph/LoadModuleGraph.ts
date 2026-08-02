/* eslint-disable @typescript-eslint/no-implied-eval, sonarjs/code-eval -- project config executes inside the isolated extension */
import type { ModuleGraph } from '../ModuleGraph/ModuleGraph.ts'
import * as Path from '../Path/Path.ts'

type CommonJsModule = {
  exports: any
}

type CommonJsRequire = {
  (specifier: string): any
  resolve(specifier: string): string
}

const resolutionKey = (parent: string, specifier: string): string =>
  `${parent}\0${specifier}`

const assert = (
  value: unknown,
  message = 'Assertion failed',
): asserts value => {
  if (!value) {
    throw new Error(message)
  }
}

const createPathModule = () => ({
  basename: Path.basename,
  delimiter: ':',
  dirname: Path.dirname,
  extname: Path.extname,
  isAbsolute: (path: string): boolean => path.startsWith('/'),
  join: Path.join,
  normalize: Path.normalize,
  parse: (path: string) => {
    const base = Path.basename(path)
    const extension = Path.extname(base)
    return {
      base,
      dir: Path.dirname(path),
      ext: extension,
      name: extension ? base.slice(0, -extension.length) : base,
      root: path.startsWith('/') ? '/' : '',
    }
  },
  posix: undefined as unknown,
  relative: Path.relative,
  resolve: Path.resolve,
  sep: '/',
  win32: undefined as unknown,
})

const childProcessesUnavailable = (): never => {
  throw new Error(
    'Child processes are not available in the ESLint config sandbox',
  )
}

const createHash = () => {
  let value = 0
  const hash = {
    digest: (encoding?: string): string => {
      const hex = Math.abs(value).toString(16)
      return encoding === 'hex' ? hex : hex
    },
    update: (data: unknown) => {
      const text = String(data)
      for (let index = 0; index < text.length; index++) {
        value = ((value << 5) - value + text.codePointAt(index)!) | 0
      }
      return hash
    },
  }
  return hash
}

const workerThreadsUnavailable = (): never => {
  throw new Error(
    'Worker threads are not available in the ESLint config sandbox',
  )
}

const isIPv4 = (value: string): boolean => {
  const parts = value.split('.')
  return (
    parts.length === 4 &&
    parts.every(
      (part) =>
        /^\d{1,3}$/.test(part) && Number(part) >= 0 && Number(part) <= 255,
    )
  )
}

const isIPv6 = (value: string): boolean => {
  if (!value.includes(':') || !/^[\dA-Fa-f:.]+$/.test(value)) {
    return false
  }
  const doubleColonCount = value.split('::').length - 1
  if (doubleColonCount > 1) {
    return false
  }
  const parts = value.split(':').filter(Boolean)
  const expectedMaximum = value.includes('::') ? 7 : 8
  return (
    parts.length <= expectedMaximum &&
    parts.every((part) =>
      part.includes('.') ? isIPv4(part) : /^[\dA-Fa-f]{1,4}$/.test(part),
    )
  )
}

const isIP = (value: string): 0 | 4 | 6 => {
  if (isIPv4(value)) {
    return 4
  }
  return isIPv6(value) ? 6 : 0
}

const createBuiltins = (graph: ModuleGraph): Readonly<Record<string, any>> => {
  const path = createPathModule()
  path.posix = path
  path.win32 = path
  const existsSync = (filePath: string): boolean =>
    Object.hasOwn(graph.modules, Path.normalize(filePath))
  const readFileSync = (
    filePath: string,
    encoding?: string,
  ): string | Uint8Array => {
    const normalized = Path.normalize(filePath)
    if (!Object.hasOwn(graph.modules, normalized)) {
      throw new Error(`Virtual file is not available: ${normalized}`)
    }
    const content = graph.modules[normalized]
    return encoding ? content : new TextEncoder().encode(content)
  }
  const readdirSync = (directory: string): readonly string[] => {
    const normalized = Path.normalize(directory).replace(/\/$/, '')
    const prefix = `${normalized}/`
    const entries = new Set<string>()
    for (const path of Object.keys(graph.modules)) {
      if (!path.startsWith(prefix)) {
        continue
      }
      const relative = path.slice(prefix.length)
      entries.add(relative.split('/', 1)[0])
    }
    return [...entries]
  }
  const realpathSync = Object.assign(
    (path: string): string => Path.normalize(path),
    {
      native: (path: string): string => Path.normalize(path),
    },
  )
  const statSync = (path: string) => {
    const normalized = Path.normalize(path).replace(/\/$/, '')
    const isFile = Object.hasOwn(graph.modules, normalized)
    const prefix = `${normalized}/`
    const isDirectory = Object.keys(graph.modules).some((modulePath) =>
      modulePath.startsWith(prefix),
    )
    return {
      isDirectory: (): boolean => isDirectory,
      isFile: (): boolean => isFile,
    }
  }
  const fs = {
    existsSync,
    readdirSync,
    readFileSync,
    realpathSync,
    statSync,
  }
  class MessageChannel {
    readonly port1 = {}
    readonly port2 = {}
  }
  class Worker {
    postMessage(): never {
      return workerThreadsUnavailable()
    }

    unref(): this {
      return this
    }
  }
  class EventEmitter {
    readonly listeners = new Map<
      string | symbol,
      Array<(...args: any[]) => void>
    >()

    emit(event: string | symbol, ...args: any[]): boolean {
      const listeners = this.listeners.get(event) ?? []
      for (const listener of listeners) {
        listener(...args)
      }
      return listeners.length > 0
    }

    off(event: string | symbol, listener: (...args: any[]) => void): this {
      return this.removeListener(event, listener)
    }

    on(event: string | symbol, listener: (...args: any[]) => void): this {
      const listeners = this.listeners.get(event) ?? []
      listeners.push(listener)
      this.listeners.set(event, listeners)
      return this
    }

    removeListener(
      event: string | symbol,
      listener: (...args: any[]) => void,
    ): this {
      const listeners = this.listeners.get(event) ?? []
      const index = listeners.indexOf(listener)
      if (index !== -1) {
        listeners.splice(index, 1)
      }
      return this
    }
  }
  const events = Object.assign(EventEmitter, {
    default: EventEmitter,
    EventEmitter,
  })
  const assertModule = Object.assign(assert, {
    equal: (actual: unknown, expected: unknown): void =>
      assert(actual == expected),
    ok: assert,
    strictEqual: (actual: unknown, expected: unknown): void =>
      assert(actual === expected),
  })
  const utilTypes = {
    isRegExp: (value: unknown): value is RegExp => value instanceof RegExp,
  }
  return {
    'node:assert': assertModule,
    'node:assert/strict': assertModule,
    'node:child_process': {
      execFileSync: childProcessesUnavailable,
      execSync: childProcessesUnavailable,
      spawn: childProcessesUnavailable,
      spawnSync: childProcessesUnavailable,
    },
    'node:crypto': {
      createHash,
    },
    'node:events': events,
    'node:fs': fs,
    'node:fs/promises': {
      readFile: async (filePath: string, encoding?: string) =>
        readFileSync(filePath, encoding),
    },
    'node:inspector': {
      Session: undefined,
    },
    'node:net': {
      isIP,
      isIPv4,
      isIPv6,
    },
    'node:os': {
      arch: (): string => 'x64',
      EOL: '\n',
      homedir: (): string => '/',
      platform: (): string => 'browser',
      tmpdir: (): string => '/tmp',
    },
    'node:path': path,
    'node:path/posix': path,
    'node:path/win32': path,
    'node:perf_hooks': {
      performance: globalThis.performance,
    },
    'node:process': {
      cwd: (): string => Path.dirname(graph.entry),
      env: Object.freeze({}),
      platform: 'browser',
    },
    'node:url': {
      fileURLToPath: (url: string | URL): string => new URL(url).pathname,
      pathToFileURL: (filePath: string): URL =>
        new URL(`file://${Path.normalize(filePath)}`),
    },
    'node:util': {
      inspect: (value: unknown): string => JSON.stringify(value),
      promisify:
        (fn: (...args: any[]) => any) =>
        (...args: any[]) =>
          Promise.resolve(fn(...args)),
      types: utilTypes,
    },
    'node:util/types': utilTypes,
    'node:worker_threads': {
      isMainThread: true,
      MessageChannel,
      parentPort: null,
      receiveMessageOnPort: workerThreadsUnavailable,
      Worker,
      workerData: null,
    },
  }
}

const getDefaultExport = (value: any): any => {
  if (
    value &&
    typeof value === 'object' &&
    '__esModule' in value &&
    'default' in value
  ) {
    return value.default
  }
  return value
}

export const loadModuleGraph = (graph: ModuleGraph): any => {
  const cache = new Map<string, CommonJsModule>()
  const builtins = createBuiltins(graph)
  const resolvePreloadedPath = (specifier: string): string | undefined => {
    if (!specifier.startsWith('/')) {
      return undefined
    }
    const normalized = Path.normalize(specifier)
    const candidates = [
      normalized,
      `${normalized}.js`,
      `${normalized}.cjs`,
      `${normalized}.mjs`,
      `${normalized}.json`,
      Path.join(normalized, 'index.js'),
      Path.join(normalized, 'index.cjs'),
      Path.join(normalized, 'index.mjs'),
      Path.join(normalized, 'index.json'),
    ]
    return candidates.find((candidate) =>
      Object.hasOwn(graph.modules, candidate),
    )
  }
  const resolveKnownSpecifier = (specifier: string): string | undefined => {
    const suffix = `\0${specifier}`
    for (const [key, resolved] of Object.entries(graph.resolutions)) {
      if (key.endsWith(suffix)) {
        return resolved
      }
    }
    return undefined
  }

  const load = (id: string): any => {
    const builtin = builtins[id]
    if (builtin) {
      return builtin
    }
    const cached = cache.get(id)
    if (cached) {
      return cached.exports
    }
    if (!Object.hasOwn(graph.modules, id)) {
      throw new Error(`Module is not in the preloaded graph: ${id}`)
    }
    const source = graph.modules[id]
    const module: CommonJsModule = { exports: {} }
    cache.set(id, module)
    if (id.endsWith('.json')) {
      module.exports = JSON.parse(source)
      return module.exports
    }
    const require = ((specifier: string): any => {
      if (specifier === 'module' || specifier === 'node:module') {
        const builtinModules = Object.keys(builtins).map((id) => id.slice(5))
        return {
          builtinModules,
          createRequire: () => require,
          isBuiltin: (id: string): boolean =>
            Boolean(builtins[id.startsWith('node:') ? id : `node:${id}`]),
        }
      }
      const normalizedBuiltin = specifier.startsWith('node:')
        ? specifier
        : `node:${specifier}`
      if (builtins[normalizedBuiltin]) {
        return builtins[normalizedBuiltin]
      }
      const resolved = graph.resolutions[resolutionKey(id, specifier)]
      if (!resolved) {
        const dynamicPath = specifier.startsWith('.')
          ? Path.join(Path.dirname(id), specifier)
          : specifier
        const preloadedPath = resolvePreloadedPath(dynamicPath)
        if (preloadedPath) {
          return load(preloadedPath)
        }
        const knownResolution = resolveKnownSpecifier(specifier)
        if (knownResolution) {
          return load(knownResolution)
        }
        throw new Error(`Module '${specifier}' was not preloaded for ${id}`)
      }
      return load(resolved)
    }) as CommonJsRequire
    require.resolve = (specifier: string): string => {
      const normalizedBuiltin = specifier.startsWith('node:')
        ? specifier
        : `node:${specifier}`
      if (builtins[normalizedBuiltin]) {
        return normalizedBuiltin
      }
      const resolved = graph.resolutions[resolutionKey(id, specifier)]
      if (!resolved) {
        const dynamicPath = specifier.startsWith('.')
          ? Path.join(Path.dirname(id), specifier)
          : specifier
        const preloadedPath = resolvePreloadedPath(dynamicPath)
        if (preloadedPath) {
          return preloadedPath
        }
        const knownResolution = resolveKnownSpecifier(specifier)
        if (knownResolution) {
          return knownResolution
        }
        throw new Error(`Module '${specifier}' was not preloaded for ${id}`)
      }
      return resolved
    }
    const evaluate = new Function(
      'module',
      'exports',
      'require',
      '__filename',
      '__dirname',
      `'use strict';\n${source}\n//# sourceURL=${id}`,
    )
    evaluate(module, module.exports, require, id, Path.dirname(id))
    return module.exports
  }

  return getDefaultExport(load(graph.entry))
}
