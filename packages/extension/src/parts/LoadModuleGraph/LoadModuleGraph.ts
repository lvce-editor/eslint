/* eslint-disable @typescript-eslint/no-implied-eval, sonarjs/code-eval -- project config executes inside the isolated extension */
import type { ModuleGraph } from '../ModuleGraph/ModuleGraph.ts'
import * as Path from '../Path/Path.ts'

type CommonJsModule = {
  exports: any
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
  posix: undefined as unknown,
  relative: Path.relative,
  resolve: Path.resolve,
  sep: '/',
  win32: undefined as unknown,
})

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
  const fs = {
    existsSync,
    readFileSync,
  }
  return {
    'node:assert': Object.assign(assert, {
      equal: (actual: unknown, expected: unknown): void =>
        assert(actual == expected),
      ok: assert,
      strictEqual: (actual: unknown, expected: unknown): void =>
        assert(actual === expected),
    }),
    'node:fs': fs,
    'node:fs/promises': {
      readFile: async (filePath: string, encoding?: string) =>
        readFileSync(filePath, encoding),
    },
    'node:os': {
      arch: (): string => 'x64',
      EOL: '\n',
      homedir: (): string => '/',
      platform: (): string => 'browser',
      tmpdir: (): string => '/tmp',
    },
    'node:path': path,
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
      types: {},
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
    const require = (specifier: string): any => {
      if (specifier === 'module' || specifier === 'node:module') {
        return { createRequire: () => require }
      }
      const normalizedBuiltin = specifier.startsWith('node:')
        ? specifier
        : `node:${specifier}`
      if (builtins[normalizedBuiltin]) {
        return builtins[normalizedBuiltin]
      }
      const resolved = graph.resolutions[resolutionKey(id, specifier)]
      if (!resolved) {
        throw new Error(`Module '${specifier}' was not preloaded for ${id}`)
      }
      return load(resolved)
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
