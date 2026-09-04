/* eslint-disable @typescript-eslint/no-implied-eval, sonarjs/code-eval -- project modules execute inside the isolated evaluation worker */
import { Buffer } from 'buffer/index.js'
import { gzip, ungzip } from 'pako'
import type { ModuleGraph } from '../ModuleGraph/ModuleGraph.ts'
import * as Path from '../Path/Path.ts'

type CommonJsModule = {
  exports: any
}

type VirtualFile = NonNullable<ModuleGraph['files']>[string]

interface RuntimeState {
  readonly evaluatedGraphIds: Map<string, string>
  readonly evaluatedModules: Map<string, CommonJsModule>
  readonly executableFingerprints: Map<string, string>
  readonly files: Record<string, VirtualFile>
  readonly lazyModules: Record<string, string>
  readonly modules: Record<string, string>
  readonly resolutions: Record<string, string>
  readonly virtualDirectories: Set<string>
  readonly virtualDirectoryEntries: Map<string, Set<string>>
}

export interface EvaluatedModuleGraph {
  readonly compatibilityRuntime: ModuleCompatibilityRuntime
  readonly entry: string
  readonly exports: any
  readonly id: string
}

export interface ModuleRuntime {
  evaluate(graph: ModuleGraph): EvaluatedModuleGraph
}

export class ModuleRuntimeConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ModuleRuntimeConflictError'
  }
}

type CommonJsRequire = {
  (specifier: string): any
  extensions: Readonly<Record<string, unknown>>
  resolve(specifier: string): string
}

interface DeferredRequest {
  readonly arguments: readonly unknown[]
  readonly key: string
  readonly workerPath: string
}

export interface ModuleCompatibilityRuntime {
  flush: () => Promise<void>
  hasPending: () => boolean
}

const createDeferredSyncRuntime = (
  loadWorker: (path: string) => void,
): ModuleCompatibilityRuntime & { readonly adapter: object } => {
  const callbacks = new Map<string, (...args: any[]) => Promise<unknown>>()
  const pending = new Map<string, DeferredRequest>()
  const results = new Map<string, unknown>()
  let activeWorkerPath = ''
  const rememberResult = (key: string, value: unknown): void => {
    results.delete(key)
    results.set(key, value)
    while (results.size > 32) {
      results.delete(results.keys().next().value!)
    }
  }
  const adapter = {
    createSyncFn:
      (workerPath: string) =>
      (...args: readonly unknown[]): unknown => {
        const key = JSON.stringify([workerPath, args])
        if (results.has(key)) {
          const result = results.get(key)
          results.delete(key)
          results.set(key, result)
          return result
        }
        pending.set(key, { arguments: args, key, workerPath })
        return { errors: [], issues: [] }
      },
    runAsWorker: (callback: (...args: any[]) => Promise<unknown>): void => {
      if (!activeWorkerPath) {
        throw new Error('CSpell worker adapter was loaded outside a flush')
      }
      callbacks.set(activeWorkerPath, callback)
    },
  }
  return {
    adapter,
    flush: async (): Promise<void> => {
      while (pending.size > 0) {
        const requests = pending.values().toArray()
        pending.clear()
        for (const request of requests) {
          let callback = callbacks.get(request.workerPath)
          if (!callback) {
            activeWorkerPath = request.workerPath
            try {
              loadWorker(request.workerPath)
            } finally {
              activeWorkerPath = ''
            }
            callback = callbacks.get(request.workerPath)
          }
          if (!callback) {
            throw new Error(
              `CSpell worker did not register a handler: ${request.workerPath}`,
            )
          }
          rememberResult(request.key, await callback(...request.arguments))
        }
      }
    },
    hasPending: (): boolean => pending.size > 0,
  }
}

const clearImmediate = (handle: ReturnType<typeof setTimeout>): void => {
  clearTimeout(handle)
}

const setImmediate = (
  callback: (...args: any[]) => void,
  ...args: any[]
): ReturnType<typeof setTimeout> => setTimeout(callback, 0, ...args)

const resolutionKey = (parent: string, specifier: string): string =>
  `${parent}\0${specifier}`

const appendPathPart = (
  parts: string[],
  part: string,
  absolute: boolean,
): void => {
  if (part !== '..') {
    parts.push(part)
    return
  }
  if (parts.length > 0 && parts.at(-1) !== '..') {
    parts.pop()
  } else if (!absolute) {
    parts.push(part)
  }
}

const normalizePathModulePath = (path: string): string => {
  const absolute = path.startsWith('/')
  const parts: string[] = []
  for (const part of path.split('/')) {
    if (!part || part === '.') {
      continue
    }
    appendPathPart(parts, part, absolute)
  }
  let normalized = `${absolute ? '/' : ''}${parts.join('/')}`
  if (!normalized) {
    normalized = absolute ? '/' : '.'
  }
  return path.endsWith('/') && normalized !== '/'
    ? `${normalized}/`
    : normalized
}

const dirnamePathModulePath = (path: string): string => {
  const normalized = normalizePathModulePath(path)
  if (normalized === '/') {
    return normalized
  }
  const withoutTrailingSeparator = normalized.endsWith('/')
    ? normalized.slice(0, -1)
    : normalized
  const index = withoutTrailingSeparator.lastIndexOf('/')
  if (index === -1) {
    return '.'
  }
  return index === 0 ? '/' : withoutTrailingSeparator.slice(0, index)
}

const assert = (
  value: unknown,
  message = 'Assertion failed',
): asserts value => {
  if (!value) {
    throw new Error(message)
  }
}

const createPathModule = (cwd: string) => ({
  basename: Path.basename,
  delimiter: ':',
  dirname: dirnamePathModulePath,
  extname: Path.extname,
  isAbsolute: (path: string): boolean => path.startsWith('/'),
  join: (...paths: readonly string[]): string =>
    normalizePathModulePath(paths.join('/')),
  normalize: normalizePathModulePath,
  parse: (path: string) => {
    const base = Path.basename(path)
    const extension = Path.extname(base)
    return {
      base,
      dir: dirnamePathModulePath(path),
      ext: extension,
      name: extension ? base.slice(0, -extension.length) : base,
      root: path.startsWith('/') ? '/' : '',
    }
  },
  posix: undefined as unknown,
  relative: Path.relative,
  resolve: (...paths: readonly string[]): string => {
    let resolved = ''
    for (const path of paths) {
      if (path.startsWith('/')) {
        resolved = path
      } else {
        resolved = Path.join(resolved || cwd, path)
      }
    }
    return Path.normalize(resolved || cwd)
  },
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

const writeUnavailable = (): never => {
  throw new Error('The ESLint config virtual file system is read-only')
}

const toCallbackError = (error: unknown): Error => {
  if (error instanceof Error) {
    return error
  }
  return new Error(typeof error === 'string' ? error : 'Callback failed')
}

const promisify = (fn: (...args: any[]) => any) => {
  return (...args: any[]): Promise<unknown> =>
    new Promise((resolve, reject) => {
      const callback = (error: unknown, value: unknown): void => {
        if (error) {
          reject(toCallbackError(error))
        } else {
          resolve(value)
        }
      }
      fn(...args, callback)
    })
}

const runInNewContext = (source: string): undefined => {
  const compiled = new Function(`'use strict';\n${source}`)
  Object.freeze(compiled)
  return undefined
}

const createOutputStream = (fd: number) => ({
  columns: undefined,
  fd,
  isTTY: false,
  write: (): boolean => true,
})

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

const isDeepStrictEqual = (
  actual: unknown,
  expected: unknown,
  seen = new WeakMap<object, object>(),
): boolean => {
  if (Object.is(actual, expected)) {
    return true
  }
  if (
    !actual ||
    !expected ||
    typeof actual !== 'object' ||
    typeof expected !== 'object' ||
    Object.getPrototypeOf(actual) !== Object.getPrototypeOf(expected)
  ) {
    return false
  }
  const seenExpected = seen.get(actual)
  if (seenExpected) {
    return seenExpected === expected
  }
  seen.set(actual, expected)
  const actualKeys = Reflect.ownKeys(actual).filter((key) =>
    Object.prototype.propertyIsEnumerable.call(actual, key),
  )
  const expectedKeys = Reflect.ownKeys(expected).filter((key) =>
    Object.prototype.propertyIsEnumerable.call(expected, key),
  )
  return (
    actualKeys.length === expectedKeys.length &&
    actualKeys.every(
      (key) =>
        expectedKeys.includes(key) &&
        isDeepStrictEqual(
          (actual as Record<PropertyKey, unknown>)[key],
          (expected as Record<PropertyKey, unknown>)[key],
          seen,
        ),
    )
  )
}

const createVirtualProcess = (entry: string) => {
  const startTime = globalThis.performance.now()
  const getElapsedNanoseconds = (): number =>
    Math.floor((globalThis.performance.now() - startTime) * 1_000_000)
  const hrtime = Object.assign(
    (previous?: readonly [number, number]): [number, number] => {
      const elapsed = getElapsedNanoseconds()
      const seconds = Math.floor(elapsed / 1_000_000_000)
      const nanoseconds = elapsed % 1_000_000_000
      if (!previous) {
        return [seconds, nanoseconds]
      }
      let differenceSeconds = seconds - previous[0]
      let differenceNanoseconds = nanoseconds - previous[1]
      if (differenceNanoseconds < 0) {
        differenceSeconds--
        differenceNanoseconds += 1_000_000_000
      }
      return [differenceSeconds, differenceNanoseconds]
    },
    {
      bigint: (): bigint => BigInt(getElapsedNanoseconds()),
    },
  )
  return {
    argv: [] as readonly string[],
    cwd: (): string => Path.dirname(entry),
    env: Object.freeze({}),
    execPath: '/usr/bin/node',
    features: Object.freeze({ typescript: false }),
    hrtime,
    memoryUsage: () => ({
      arrayBuffers: 0,
      external: 0,
      heapTotal: 0,
      heapUsed: 0,
      rss: 0,
    }),
    nextTick: (callback: () => void): void => queueMicrotask(callback),
    pid: 1,
    platform: 'linux',
    ppid: 0,
    stderr: createOutputStream(2),
    stdout: createOutputStream(1),
    version: 'v0.0.0',
    versions: Object.freeze({ node: '0.0.0' }),
  }
}

const decodeBase64 = (content: string): Uint8Array => {
  const binary = atob(content)
  return Uint8Array.from(binary, (character) => character.codePointAt(0)!)
}

const encodeVirtualFile = (
  content: NonNullable<ModuleGraph['files']>[string],
): Buffer => {
  return typeof content === 'string'
    ? Buffer.from(content, 'utf8')
    : Buffer.from(decodeBase64(content.content))
}

const createBuiltins = (
  state: RuntimeState,
  entry: string,
): Readonly<Record<string, any>> => {
  const path = createPathModule(Path.dirname(entry))
  path.posix = path
  path.win32 = path
  const existsSync = (filePath: string): boolean => {
    const normalized = Path.normalize(filePath).replace(/\/$/, '')
    return (
      state.executableFingerprints.has(normalized) ||
      Object.hasOwn(state.files, normalized) ||
      state.virtualDirectories.has(normalized)
    )
  }
  const readFileSync = (
    filePath: string,
    encoding?: string,
  ): string | Buffer => {
    const normalized = Path.normalize(filePath)
    if (!Object.hasOwn(state.files, normalized)) {
      throw new Error(`Virtual file is not available: ${normalized}`)
    }
    const content = state.files[normalized]
    const buffer = encodeVirtualFile(content)
    return encoding ? buffer.toString(encoding) : buffer
  }
  const readdirSync = (
    directory: string,
    options?: string | { readonly withFileTypes?: boolean },
  ): readonly unknown[] => {
    const normalized = Path.normalize(directory).replace(/\/$/, '')
    const entries = [...(state.virtualDirectoryEntries.get(normalized) ?? [])]
    if (typeof options === 'object' && options.withFileTypes) {
      return entries.map((name) => {
        const path = Path.join(normalized, name)
        return {
          isDirectory: (): boolean => state.virtualDirectories.has(path),
          isFile: (): boolean =>
            state.executableFingerprints.has(path) ||
            Object.hasOwn(state.files, path),
          isSymbolicLink: (): boolean => false,
          name,
        }
      })
    }
    return entries
  }
  const realpathSync = Object.assign(
    (path: string): string => Path.normalize(path),
    {
      native: (path: string): string => Path.normalize(path),
    },
  )
  const statSync = (path: string) => {
    const normalized = Path.normalize(path).replace(/\/$/, '')
    const isFile =
      state.executableFingerprints.has(normalized) ||
      Object.hasOwn(state.files, normalized)
    const isDirectory = state.virtualDirectories.has(normalized)
    const size = Object.hasOwn(state.files, normalized)
      ? encodeVirtualFile(state.files[normalized]).length
      : 0
    return {
      isDirectory: (): boolean => isDirectory,
      isFile: (): boolean => isFile,
      isSymbolicLink: (): boolean => false,
      mtimeMs: 0,
      size,
    }
  }
  const fs = {
    existsSync,
    readdirSync,
    readFileSync,
    realpathSync,
    statSync,
    writeFile: writeUnavailable,
    writeFileSync: writeUnavailable,
  }
  const fsPromises = {
    readdir: async (
      directory: string,
      options?: string | { readonly withFileTypes?: boolean },
    ) => readdirSync(directory, options),
    readFile: async (filePath: string, encoding?: string) =>
      readFileSync(filePath, encoding),
    stat: async (filePath: string) => statSync(filePath),
    writeFile: async (): Promise<never> => writeUnavailable(),
  }
  Object.assign(fs, { promises: fsPromises })
  class AsyncLocalStorage<T = unknown> {
    private store: T | undefined

    disable(): void {
      this.store = undefined
    }

    enterWith(store: T): void {
      this.store = store
    }

    getStore(): T | undefined {
      return this.store
    }

    run<R>(store: T, callback: (...args: any[]) => R, ...args: any[]): R {
      const previous = this.store
      this.store = store
      try {
        return callback(...args)
      } finally {
        this.store = previous
      }
    }
  }
  const gzipCallback = (
    input: Uint8Array | string,
    optionsOrCallback: object | ((error: Error | null, data: Buffer) => void),
    optionalCallback?: (error: Error | null, data: Buffer) => void,
  ): void => {
    const callback =
      typeof optionsOrCallback === 'function'
        ? optionsOrCallback
        : optionalCallback
    if (!callback) {
      throw new TypeError('The gzip callback is required')
    }
    queueMicrotask(() => {
      try {
        callback(null, Buffer.from(gzip(input)))
      } catch (error) {
        callback(
          error instanceof Error ? error : new Error(String(error)),
          Buffer.alloc(0),
        )
      }
    })
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
  class Readable extends EventEmitter {
    destroy(): this {
      this.emit('close')
      return this
    }

    push(value: unknown): boolean {
      if (value === null) {
        this.emit('end')
        return false
      }
      this.emit('data', value)
      return true
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
  const process = createVirtualProcess(entry)
  return {
    'node:assert': assertModule,
    'node:assert/strict': assertModule,
    'node:async_hooks': {
      AsyncLocalStorage,
    },
    'node:buffer': {
      Buffer,
    },
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
    'node:fs/promises': fsPromises,
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
      availableParallelism: (): number => 1,
      cpus: () => [
        {
          model: 'browser',
          speed: 0,
          times: { idle: 0, irq: 0, nice: 0, sys: 0, user: 0 },
        },
      ],
      EOL: '\n',
      homedir: (): string => '/',
      platform: (): string => 'linux',
      release: (): string => '',
      tmpdir: (): string => '/tmp',
    },
    'node:path': path,
    'node:path/posix': path,
    'node:path/win32': path,
    'node:perf_hooks': {
      performance: globalThis.performance,
    },
    'node:process': process,
    'node:stream': {
      Readable,
    },
    'node:tty': {
      isatty: (): boolean => false,
    },
    'node:url': {
      fileURLToPath: (url: string | URL): string => new URL(url).pathname,
      pathToFileURL: (filePath: string): URL =>
        new URL(`file://${Path.normalize(filePath)}`),
    },
    'node:util': {
      inspect: (value: unknown): string => JSON.stringify(value),
      isDeepStrictEqual,
      promisify,
      types: utilTypes,
    },
    'node:util/types': utilTypes,
    'node:vm': {
      runInNewContext,
    },
    'node:worker_threads': {
      isMainThread: true,
      MessageChannel,
      parentPort: null,
      receiveMessageOnPort: workerThreadsUnavailable,
      Worker,
      workerData: null,
    },
    'node:zlib': {
      gunzipSync: (input: Uint8Array): Buffer => Buffer.from(ungzip(input)),
      gzip: gzipCallback,
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

const fingerprint = (source: string): string => {
  let first = 2_166_136_261
  let second = 2_654_435_769
  for (let index = 0; index < source.length; index++) {
    const code = source.codePointAt(index)!
    first = Math.imul(first ^ code, 16_777_619)
    second = Math.imul(second ^ code, 2_246_822_519)
  }
  return `${source.length}:${first >>> 0}:${second >>> 0}`
}

const addVirtualPath = (state: RuntimeState, filePath: string): void => {
  let child = filePath
  let parent = Path.dirname(child)
  while (parent !== child) {
    state.virtualDirectories.add(parent)
    const entries =
      state.virtualDirectoryEntries.get(parent) ?? new Set<string>()
    entries.add(Path.basename(child))
    state.virtualDirectoryEntries.set(parent, entries)
    child = parent
    parent = Path.dirname(child)
  }
}

const areVirtualFilesEqual = (a: VirtualFile, b: VirtualFile): boolean => {
  if (typeof a === 'string') {
    return a === b
  }
  return (
    typeof b !== 'string' &&
    a.encoding === b.encoding &&
    a.content === b.content
  )
}

const mergeFiles = (
  state: RuntimeState,
  files: Readonly<Record<string, VirtualFile>>,
): void => {
  for (const [rawPath, source] of Object.entries(files)) {
    const path = Path.normalize(rawPath)
    const hasChanged =
      Object.hasOwn(state.files, path) &&
      !areVirtualFilesEqual(state.files[path], source)
    if (hasChanged) {
      throw new ModuleRuntimeConflictError(
        `Virtual file changed while evaluating the project: ${path}`,
      )
    }
    state.files[path] = source
    addVirtualPath(state, path)
  }
}

const mergeExecutables = (
  state: RuntimeState,
  sources: Readonly<Record<string, string>>,
  target: Record<string, string>,
): void => {
  for (const [rawPath, source] of Object.entries(sources)) {
    const path = Path.normalize(rawPath)
    const nextFingerprint = fingerprint(source)
    const existingFingerprint = state.executableFingerprints.get(path)
    if (existingFingerprint && existingFingerprint !== nextFingerprint) {
      throw new ModuleRuntimeConflictError(
        `Module changed while evaluating the project: ${path}`,
      )
    }
    state.executableFingerprints.set(path, nextFingerprint)
    if (!state.evaluatedModules.has(path)) {
      if (target === state.modules) {
        delete state.lazyModules[path]
        target[path] = source
      } else if (!Object.hasOwn(state.modules, path)) {
        target[path] = source
      }
    }
    addVirtualPath(state, path)
  }
}

const mergeResolutions = (
  state: RuntimeState,
  resolutions: Readonly<Record<string, string>>,
): void => {
  for (const [rawKey, rawResolved] of Object.entries(resolutions)) {
    const separatorIndex = rawKey.indexOf('\0')
    const parent = Path.normalize(rawKey.slice(0, separatorIndex))
    const specifier = rawKey.slice(separatorIndex + 1)
    const key = resolutionKey(parent, specifier)
    const resolved =
      rawResolved.startsWith('node:') || rawResolved.startsWith('compat:')
        ? rawResolved
        : Path.normalize(rawResolved)
    if (
      Object.hasOwn(state.resolutions, key) &&
      state.resolutions[key] !== resolved
    ) {
      throw new ModuleRuntimeConflictError(
        `Module resolution changed while evaluating the project: ${parent} -> ${specifier}`,
      )
    }
    state.resolutions[key] = resolved
  }
}

const mergeGraph = (state: RuntimeState, graph: ModuleGraph): string => {
  mergeFiles(state, graph.files ?? {})
  mergeExecutables(state, graph.lazyModules ?? {}, state.lazyModules)
  mergeExecutables(state, graph.modules, state.modules)
  mergeResolutions(state, graph.resolutions)
  return Path.normalize(graph.entry)
}

const createState = (): RuntimeState => ({
  evaluatedGraphIds: new Map(),
  evaluatedModules: new Map(),
  executableFingerprints: new Map(),
  files: {},
  lazyModules: {},
  modules: {},
  resolutions: {},
  virtualDirectories: new Set(),
  virtualDirectoryEntries: new Map(),
})

const evaluateGraph = (
  state: RuntimeState,
  graph: ModuleGraph,
): EvaluatedModuleGraph => {
  const entry = mergeGraph(state, graph)
  const builtins = createBuiltins(state, entry)
  const resolvePreloadedPath = (specifier: string): string | undefined => {
    const path = specifier.startsWith('file:')
      ? decodeURIComponent(new URL(specifier).pathname)
      : specifier.split(/[?#]/, 1)[0]
    if (!path.startsWith('/')) {
      return undefined
    }
    const normalized = Path.normalize(path)
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
    return candidates.find(
      (candidate) =>
        state.executableFingerprints.has(candidate) ||
        state.evaluatedModules.has(candidate),
    )
  }
  const resolveKnownSpecifier = (specifier: string): string | undefined => {
    const suffix = `\0${specifier}`
    for (const [key, resolved] of Object.entries(state.resolutions)) {
      if (key.endsWith(suffix)) {
        return resolved
      }
    }
    return undefined
  }

  const runtimeState: {
    runtime?: ReturnType<typeof createDeferredSyncRuntime>
  } = {}
  const load = (id: string): any => {
    if (id === 'compat:cspell-deferred-sync') {
      return runtimeState.runtime!.adapter
    }
    const builtin = builtins[id]
    if (builtin) {
      return builtin
    }
    const cached = state.evaluatedModules.get(id)
    if (cached) {
      return cached.exports
    }
    if (
      !Object.hasOwn(state.modules, id) &&
      !Object.hasOwn(state.lazyModules, id)
    ) {
      throw new Error(`Module is not in the preloaded graph: ${id}`)
    }
    const source = state.modules[id] ?? state.lazyModules[id]
    const sourceContainer = Object.hasOwn(state.modules, id)
      ? state.modules
      : state.lazyModules
    const module: CommonJsModule = { exports: {} }
    state.evaluatedModules.set(id, module)
    try {
      if (id.endsWith('.json')) {
        module.exports = JSON.parse(source)
        delete sourceContainer[id]
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
        const resolved = state.resolutions[resolutionKey(id, specifier)]
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
      require.extensions = Object.freeze({
        '.js': undefined,
        '.json': undefined,
      })
      require.resolve = (specifier: string): string => {
        const normalizedBuiltin = specifier.startsWith('node:')
          ? specifier
          : `node:${specifier}`
        if (builtins[normalizedBuiltin]) {
          return normalizedBuiltin
        }
        const resolved = state.resolutions[resolutionKey(id, specifier)]
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
      const createEvaluator = new Function(
        'global',
        'process',
        'clearImmediate',
        'setImmediate',
        'SharedArrayBuffer',
        `'use strict';
      return function (module, exports, require, __filename, __dirname) {
        'use strict';
        ${source}
        //# sourceURL=${id}
      }`,
      )
      const evaluate = createEvaluator(
        globalThis,
        builtins['node:process'],
        clearImmediate,
        setImmediate,
        globalThis.SharedArrayBuffer ?? globalThis.ArrayBuffer,
      )
      evaluate(module, module.exports, require, id, Path.dirname(id))
      delete sourceContainer[id]
      return module.exports
    } catch (error) {
      state.evaluatedModules.delete(id)
      const message = error instanceof Error ? error.message : String(error)
      const wrapped = new Error(
        `Failed to evaluate ESLint module ${id}: ${message}`,
        {
          cause: error,
        },
      )
      Object.defineProperty(wrapped, 'name', {
        value: error instanceof Error ? error.name : 'Error',
      })
      throw wrapped
    }
  }

  const compatibilityRuntime = createDeferredSyncRuntime((id) => load(id))
  runtimeState.runtime = compatibilityRuntime
  const exports = getDefaultExport(load(entry))
  let id = state.evaluatedGraphIds.get(entry)
  if (!id) {
    const { id: graphId } = graph
    id = graphId
    state.evaluatedGraphIds.set(entry, id)
  }
  return {
    compatibilityRuntime,
    entry,
    exports,
    id,
  }
}

export const createModuleRuntime = (): ModuleRuntime => {
  const state = createState()
  return {
    evaluate: (graph) => evaluateGraph(state, graph),
  }
}

export const loadModuleGraph = (graph: ModuleGraph): any => {
  return createModuleRuntime().evaluate(graph).exports
}
