import { beforeEach, expect, jest, test } from '@jest/globals'
import * as FileSystem from '../src/parts/FileSystem/FileSystem.ts'
import * as LoadEslintConfig from '../src/parts/ModuleResolution/ModuleResolution.ts'

const state: { files: Record<string, string> } = { files: {} }
const cacheEntries = new Map<string, Response>()
const getRequestKey = (key: string | Request): string =>
  typeof key === 'string' ? key : key.url
const match = jest.fn(async (key: string | Request) =>
  cacheEntries.get(getRequestKey(key))?.clone(),
)
const put = jest.fn(async (key: string | Request, response: Response) => {
  cacheEntries.set(getRequestKey(key), response.clone())
})
const remove = jest.fn(async (key: string | Request) =>
  cacheEntries.delete(getRequestKey(key)),
)
const open = jest.fn(
  async (_cacheName: string) =>
    ({ delete: remove, match, put }) as unknown as Cache,
)

const toPath = (uri: string): string =>
  decodeURIComponent(new URL(uri).pathname)

const readFile = async (uri: string): Promise<string> => {
  const path = toPath(uri)
  if (!(path in state.files)) {
    throw new Error(`File not found: ${path}`)
  }
  return state.files[path]
}

const stat = async (
  uri: string,
): Promise<{ isDirectory: boolean; isFile: boolean }> => {
  const path = toPath(uri)
  if (path in state.files) {
    return { isDirectory: false, isFile: true }
  }
  const prefix = `${path.replace(/\/$/, '')}/`
  if (Object.keys(state.files).some((file) => file.startsWith(prefix))) {
    return { isDirectory: true, isFile: false }
  }
  throw new Error(`File not found: ${path}`)
}

const readDirWithFileTypes = async (
  uri: string,
): Promise<Array<{ isDirectory: boolean; isFile: boolean; name: string }>> => {
  const path = toPath(uri).replace(/\/$/, '')
  const prefix = `${path}/`
  const entries = new Map<string, number>()
  for (const file of Object.keys(state.files)) {
    if (!file.startsWith(prefix)) {
      continue
    }
    const relative = file.slice(prefix.length)
    const slashIndex = relative.indexOf('/')
    const name = slashIndex === -1 ? relative : relative.slice(0, slashIndex)
    entries.set(name, slashIndex === -1 ? 7 : 3)
  }
  return Array.from(entries, ([name, type]) => ({
    isDirectory: type === 3,
    isFile: type === 7,
    name,
  }))
}

const setFiles = (value: Record<string, string>): void => {
  state.files = value
}

beforeEach(() => {
  state.files = {}
  cacheEntries.clear()
  jest.clearAllMocks()
  Object.defineProperty(globalThis, 'caches', {
    configurable: true,
    value: { open },
  })
  FileSystem.state.api = {
    readDirWithFileTypes,
    readFile,
    stat,
  }
  LoadEslintConfig.invalidateForFileChanges({
    changed: ['file:///eslint.config.js'],
  })
})

test('transforms an esm default export to commonjs', async () => {
  setFiles({
    '/workspace/eslint.config.js': `export default [{ rules: { semi: 'error' } }]`,
  })
  const graph = await LoadEslintConfig.loadEslintConfig(
    '/workspace/eslint.config.js',
  )
  expect(graph.entry).toBe('/workspace/eslint.config.js')
  expect(graph.modules[graph.entry]).toContain('exports.default')
})

test('reuses cached module analysis across projects with path-specific import meta', async () => {
  const source = `export default import.meta.dirname`
  setFiles({
    '/first-project/eslint.config.js': source,
    '/second-project/eslint.config.js': source,
  })

  const first = await LoadEslintConfig.loadEslintConfig(
    '/first-project/eslint.config.js',
  )
  const second = await LoadEslintConfig.loadEslintConfig(
    '/second-project/eslint.config.js',
  )

  expect(first.modules[first.entry]).toContain('"/first-project"')
  expect(second.modules[second.entry]).toContain('"/second-project"')
  const analysisPuts = put.mock.calls.filter(([key]) =>
    getRequestKey(key).startsWith(
      'https://eslint-module-analysis-cache.invalid/',
    ),
  )
  expect(analysisPuts).toHaveLength(1)
  expect(getRequestKey(analysisPuts[0][0])).toMatch(
    /\/module%3A\.js%3A[\da-f]{64}$/,
  )
})

test('transforms a typescript config dependency to commonjs', async () => {
  setFiles({
    '/workspace/eslint.config.js': `import { rules } from './plugin.ts'; export default [{ rules }]`,
    '/workspace/plugin.ts': `import type { Rule } from './types.ts'; const rules: Record<string, Rule> = {}; export { rules }`,
    '/workspace/types.ts': `export type Rule = { meta: string }`,
  })
  const graph = await LoadEslintConfig.loadEslintConfig(
    '/workspace/eslint.config.js',
  )

  expect(graph.modules['/workspace/plugin.ts']).toContain('exports.rules')
  expect(graph.modules['/workspace/plugin.ts']).not.toContain('import type')
  expect(graph.modules['/workspace/plugin.ts']).not.toContain('Record<string')
  expect(graph.modules).not.toHaveProperty('/workspace/types.ts')
})

test('loads typescript rules discovered with top-level await', async () => {
  setFiles({
    '/dynamic-workspace/eslint.config.js': `import * as plugin from './plugin/index.ts'; export default [{ plugins: { local: plugin } }]`,
    '/dynamic-workspace/plugin/first.ts': `export default { meta: {} }`,
    '/dynamic-workspace/plugin/index.ts': `import fs from 'fs'; import path from 'path'; const rules = {}; await Promise.all(fs.readdirSync(import.meta.dirname).filter(file => file === 'first.ts').map(async file => { rules[path.basename(file, '.ts')] = (await import('./' + file)).default })); export { rules }`,
  })
  const graph = await LoadEslintConfig.loadEslintConfig(
    '/dynamic-workspace/eslint.config.js',
  )

  expect(graph.modules['/dynamic-workspace/plugin/first.ts']).toContain(
    'exports.default',
  )
})

test('preloads workspace source files into the virtual file system', async () => {
  setFiles({
    '/workspace/eslint.config.js': `module.exports = []`,
    '/workspace/node_modules/example/index.js': `module.exports = true`,
    '/workspace/src/file.ts': `export const value = 1`,
    '/workspace/tsconfig.json': `{ "include": ["src"] }`,
  })
  const graph = await LoadEslintConfig.loadEslintConfig(
    '/workspace/eslint.config.js',
  )
  expect(graph.files['/workspace/src/file.ts']).toBe(`export const value = 1`)
  expect(graph.files['/workspace/tsconfig.json']).toBe(`{ "include": ["src"] }`)
  expect(graph.files).not.toHaveProperty(
    '/workspace/node_modules/example/index.js',
  )
})

test('preloads only the active typescript project in a large workspace', async () => {
  setFiles({
    '/large-workspace/eslint.config.js': `module.exports = []`,
    '/large-workspace/project-a/src/file.ts': `export const value = 1`,
    '/large-workspace/project-a/tsconfig.json': `{
      // Shared options and declarations live outside this project.
      "extends": "../tsconfig.base",
      "include": ["src", "../types/shared.d.ts"],
    }`,
    '/large-workspace/project-b/src/other.ts': `export const other = 2`,
    '/large-workspace/project-b/tsconfig.json': `{ "include": ["src"] }`,
    '/large-workspace/tsconfig.base.json': `{ "compilerOptions": { "strict": true } }`,
    '/large-workspace/types/shared.d.ts': `declare const shared: string`,
  })
  const graph = await LoadEslintConfig.loadEslintConfig(
    '/large-workspace/eslint.config.js',
    '/large-workspace/project-a/src/file.ts',
  )

  expect(graph.files['/large-workspace/project-a/src/file.ts']).toBe(
    `export const value = 1`,
  )
  expect(graph.files['/large-workspace/project-a/tsconfig.json']).toBe(
    `{
      // Shared options and declarations live outside this project.
      "extends": "../tsconfig.base",
      "include": ["src", "../types/shared.d.ts"],
    }`,
  )
  expect(
    Object.keys(graph.files).toSorted((left, right) =>
      left.localeCompare(right),
    ),
  ).toEqual([
    '/large-workspace/project-a/src/file.ts',
    '/large-workspace/project-a/tsconfig.json',
    '/large-workspace/tsconfig.base.json',
    '/large-workspace/types/shared.d.ts',
  ])
  expect(graph.files).not.toHaveProperty(
    '/large-workspace/project-b/src/other.ts',
  )
})

test('preloads an explicitly extended typescript config outside the config directory', async () => {
  setFiles({
    '/shared/tsconfig.base.json': `{ "compilerOptions": { "strict": true } }`,
    '/shared/workspace/eslint.config.js': `module.exports = []`,
    '/shared/workspace/src/file.ts': `export const value = 1`,
    '/shared/workspace/tsconfig.json': `{ "extends": "../tsconfig.base", "include": ["src"] }`,
  })

  const graph = await LoadEslintConfig.loadEslintConfig(
    '/shared/workspace/eslint.config.js',
    '/shared/workspace/src/file.ts',
  )

  expect(graph.files['/shared/tsconfig.base.json']).toBe(
    `{ "compilerOptions": { "strict": true } }`,
  )
})

test('preloads only the active file when a typescript project exceeds the file limit', async () => {
  const projectFiles = Object.fromEntries(
    Array.from({ length: 8200 }, (_, index) => [
      `/large-project/src/file-${index}.ts`,
      `export const value${index} = ${index}`,
    ]),
  )
  setFiles({
    '/large-project/eslint.config.js': `module.exports = []`,
    ...projectFiles,
    '/large-project/src/dependency.ts': `export const dependency = true`,
    '/large-project/src/file-8199.ts': `import type { dependency } from './dependency.ts'; export const value8199 = 8199`,
    '/large-project/src/unrelated.ts': `export const unrelated = true`,
    '/large-project/tsconfig.json': `{ "include": ["src"] }`,
  })

  const graph = await LoadEslintConfig.loadEslintConfig(
    '/large-project/eslint.config.js',
    '/large-project/src/file-8199.ts',
  )

  expect(graph.files).toEqual({
    '/large-project/src/dependency.ts': `export const dependency = true`,
    '/large-project/src/file-8199.ts': `import type { dependency } from './dependency.ts'; export const value8199 = 8199`,
    '/large-project/tsconfig.json': `{ "include": ["src"] }`,
  })
})

test('does not parse a non-code active document for module dependencies', async () => {
  setFiles({
    '/non-code/eslint.config.js': `module.exports = []`,
    '/non-code/package.json': `{
      "name": "fixture"
    }`,
  })

  const graph = await LoadEslintConfig.loadEslintConfig(
    '/non-code/eslint.config.js',
    '/non-code/package.json',
  )

  expect(graph.files['/non-code/package.json']).toBe(`{
      "name": "fixture"
    }`)
})

test('replaces import.meta paths for commonjs evaluation', async () => {
  setFiles({
    '/import-meta-workspace/eslint.config.js': `export default [import.meta.dirname, import.meta.filename, import.meta.url]`,
  })
  const graph = await LoadEslintConfig.loadEslintConfig(
    '/import-meta-workspace/eslint.config.js',
  )
  expect(graph.modules['/import-meta-workspace/eslint.config.js']).toContain(
    '/import-meta-workspace',
  )
  expect(graph.modules['/import-meta-workspace/eslint.config.js']).toContain(
    '/import-meta-workspace/eslint.config.js',
  )
  expect(graph.modules['/import-meta-workspace/eslint.config.js']).toContain(
    'file:///import-meta-workspace/eslint.config.js',
  )
  expect(
    graph.modules['/import-meta-workspace/eslint.config.js'],
  ).not.toContain('import.meta')
})

test('reloads a config when its entry source changes', async () => {
  setFiles({
    '/workspace/eslint.config.js': `export default [{ rules: { semi: 'error' } }]`,
  })
  const first = await LoadEslintConfig.loadEslintConfig(
    '/workspace/eslint.config.js',
  )

  setFiles({
    '/workspace/eslint.config.js': `export default [{ rules: { semi: 'off' } }]`,
  })
  const second = await LoadEslintConfig.loadEslintConfig(
    '/workspace/eslint.config.js',
  )

  expect(second).not.toBe(first)
  expect(second.modules[second.entry]).toContain('off')
})

test('invalidates a cached graph when an imported config module changes', async () => {
  setFiles({
    '/workspace/config-change/eslint.config.js': `import rules from './rules.js'; export default [{ rules }]`,
    '/workspace/config-change/rules.js': `export default { semi: 'error' }`,
  })
  const first = await LoadEslintConfig.loadEslintConfig(
    '/workspace/config-change/eslint.config.js',
  )

  const invalidated = LoadEslintConfig.invalidateForFileChanges({
    changed: ['file:///workspace/config-change/rules.js'],
  })
  setFiles({
    '/workspace/config-change/eslint.config.js': `import rules from './rules.js'; export default [{ rules }]`,
    '/workspace/config-change/rules.js': `export default { semi: 'off' }`,
  })
  const second = await LoadEslintConfig.loadEslintConfig(
    '/workspace/config-change/eslint.config.js',
  )

  expect(invalidated).toBe(true)
  expect(second).not.toBe(first)
  expect(second.modules['/workspace/config-change/rules.js']).toContain('off')
})

test('invalidates a cached graph when a workspace source file is deleted', async () => {
  setFiles({
    '/workspace/delete/a.ts': `export const value = 1`,
    '/workspace/delete/eslint.config.js': `module.exports = []`,
    '/workspace/delete/main.ts': `import './a.ts'`,
  })
  const first = await LoadEslintConfig.loadEslintConfig(
    '/workspace/delete/eslint.config.js',
  )

  const invalidated = LoadEslintConfig.invalidateForFileChanges({
    deleted: ['file:///workspace/delete/a.ts'],
  })
  setFiles({
    '/workspace/delete/eslint.config.js': `module.exports = []`,
    '/workspace/delete/main.ts': `import './a.ts'`,
  })
  const second = await LoadEslintConfig.loadEslintConfig(
    '/workspace/delete/eslint.config.js',
  )

  expect(invalidated).toBe(true)
  expect(second).not.toBe(first)
  expect(second.files).not.toHaveProperty('/workspace/delete/a.ts')
})

test('invalidates a cached graph when a workspace source file is created', async () => {
  setFiles({
    '/workspace/create/eslint.config.js': `module.exports = []`,
    '/workspace/create/main.ts': `import './a.ts'`,
  })
  const first = await LoadEslintConfig.loadEslintConfig(
    '/workspace/create/eslint.config.js',
  )

  const invalidated = LoadEslintConfig.invalidateForFileChanges({
    changed: ['file:///workspace/create/a.ts'],
  })
  setFiles({
    '/workspace/create/a.ts': `export const value = 1`,
    '/workspace/create/eslint.config.js': `module.exports = []`,
    '/workspace/create/main.ts': `import './a.ts'`,
  })
  const second = await LoadEslintConfig.loadEslintConfig(
    '/workspace/create/eslint.config.js',
  )

  expect(invalidated).toBe(true)
  expect(second).not.toBe(first)
  expect(second.files['/workspace/create/a.ts']).toBe(`export const value = 1`)
})

test('does not invalidate a cached graph for files outside its workspace', async () => {
  setFiles({
    '/workspace/scope/eslint.config.js': `module.exports = []`,
    '/workspace/scope/main.ts': `export const value = 1`,
  })
  await LoadEslintConfig.loadEslintConfig('/workspace/scope/eslint.config.js')

  expect(
    LoadEslintConfig.invalidateForFileChanges({
      changed: ['file:///other/a.ts'],
    }),
  ).toBe(false)
})

test('invalidates a cached graph when a preloaded project file changes', async () => {
  setFiles({
    '/workspace/project-change/eslint.config.js': `export default []`,
    '/workspace/project-change/src/file.ts': `export const value = 1`,
    '/workspace/project-change/tsconfig.json': `{ "include": ["src"] }`,
  })
  await LoadEslintConfig.loadEslintConfig(
    '/workspace/project-change/eslint.config.js',
    '/workspace/project-change/src/file.ts',
  )

  const invalidated = LoadEslintConfig.invalidateForFileChanges({
    changed: ['file:///workspace/project-change/tsconfig.json'],
  })

  expect(invalidated).toBe(true)
})

test('requests a refresh when a new eslint config file changes', () => {
  expect(
    LoadEslintConfig.invalidateForFileChanges({
      changed: ['file:///workspace/new/eslint.config.js'],
    }),
  ).toBe(true)
})

test('does not request a refresh for an unsupported eslint config file', () => {
  expect(
    LoadEslintConfig.invalidateForFileChanges({
      changed: ['file:///workspace/new/eslint.config.mjs'],
    }),
  ).toBe(false)
})

test('requests a refresh when eslint-suppressions.json changes', () => {
  expect(
    LoadEslintConfig.invalidateForFileChanges({
      changed: ['file:///workspace/eslint-suppressions.json'],
    }),
  ).toBe(true)
})

test('preloads a relative esm dependency', async () => {
  setFiles({
    '/workspace/eslint.config.js': `import rules from './rules.js'; export default [{ rules }]`,
    '/workspace/rules.js': `export default { semi: 'error' }`,
  })
  const graph = await LoadEslintConfig.loadEslintConfig(
    '/workspace/eslint.config.js',
  )
  expect(graph.modules['/workspace/rules.js']).toContain('exports.default')
  expect(graph.resolutions['/workspace/eslint.config.js\0./rules.js']).toBe(
    '/workspace/rules.js',
  )
})

test('resolves a relative dependency without an extension', async () => {
  setFiles({
    '/workspace/eslint.config.js': `module.exports = require('./rules')`,
    '/workspace/rules.js': `module.exports = [{ rules: {} }]`,
  })
  const graph = await LoadEslintConfig.loadEslintConfig(
    '/workspace/eslint.config.js',
  )
  expect(graph.resolutions['/workspace/eslint.config.js\0./rules']).toBe(
    '/workspace/rules.js',
  )
})

test('resolves a package main entry', async () => {
  setFiles({
    '/workspace/eslint.config.js': `import plugin from 'eslint-plugin-example'; export default [{ plugins: { example: plugin } }]`,
    '/workspace/node_modules/eslint-plugin-example/index.js': `module.exports = { rules: {} }`,
    '/workspace/node_modules/eslint-plugin-example/package.json': `{"main":"index.js"}`,
  })
  const graph = await LoadEslintConfig.loadEslintConfig(
    '/workspace/eslint.config.js',
  )
  expect(
    graph.resolutions['/workspace/eslint.config.js\0eslint-plugin-example'],
  ).toBe('/workspace/node_modules/eslint-plugin-example/index.js')
})

test('uses package main when browser is a module replacement map', async () => {
  setFiles({
    '/workspace/eslint.config.js': `module.exports = require('example')`,
    '/workspace/node_modules/example/lib/index.js': `module.exports = []`,
    '/workspace/node_modules/example/package.json': JSON.stringify({
      browser: { path: './path-browser.js' },
      main: './lib/index.js',
    }),
  })
  const graph = await LoadEslintConfig.loadEslintConfig(
    '/workspace/eslint.config.js',
  )
  expect(graph.resolutions['/workspace/eslint.config.js\0example']).toBe(
    '/workspace/node_modules/example/lib/index.js',
  )
})

test('prefers package main over module for commonjs evaluation', async () => {
  setFiles({
    '/main-workspace/eslint.config.js': `module.exports = require('example')`,
    '/main-workspace/node_modules/example/index.cjs': `module.exports = true`,
    '/main-workspace/node_modules/example/index.mjs': `export default true`,
    '/main-workspace/node_modules/example/package.json': JSON.stringify({
      main: './index.cjs',
      module: './index.mjs',
    }),
  })
  const graph = await LoadEslintConfig.loadEslintConfig(
    '/main-workspace/eslint.config.js',
  )
  expect(graph.resolutions['/main-workspace/eslint.config.js\0example']).toBe(
    '/main-workspace/node_modules/example/index.cjs',
  )
})

test('resolves dependencies through a package browser replacement map', async () => {
  setFiles({
    '/browser-workspace/eslint.config.js': `module.exports = require('example')`,
    '/browser-workspace/node_modules/example/fs-browser.js': `module.exports = { browser: true }`,
    '/browser-workspace/node_modules/example/index.js': `module.exports = require('fs')`,
    '/browser-workspace/node_modules/example/package.json': JSON.stringify({
      browser: { fs: './fs-browser.js' },
      main: './index.js',
    }),
  })
  const graph = await LoadEslintConfig.loadEslintConfig(
    '/browser-workspace/eslint.config.js',
  )
  expect(
    graph.resolutions['/browser-workspace/node_modules/example/index.js\0fs'],
  ).toBe('/browser-workspace/node_modules/example/fs-browser.js')
})

test('prefers a package exports require entry for commonjs evaluation', async () => {
  setFiles({
    '/workspace/eslint.config.js': `export { default } from 'eslint-config-example'`,
    '/workspace/node_modules/eslint-config-example/cjs.cjs': `module.exports = []`,
    '/workspace/node_modules/eslint-config-example/esm.js': `export default []`,
    '/workspace/node_modules/eslint-config-example/package.json': `{"exports":{".":{"import":"./esm.js","require":"./cjs.cjs"}}}`,
  })
  const graph = await LoadEslintConfig.loadEslintConfig(
    '/workspace/eslint.config.js',
  )
  expect(
    graph.resolutions['/workspace/eslint.config.js\0eslint-config-example'],
  ).toBe('/workspace/node_modules/eslint-config-example/cjs.cjs')
})

test('prefers a worker export over a browser DOM export', async () => {
  setFiles({
    '/worker-workspace/eslint.config.js': `module.exports = require('example')`,
    '/worker-workspace/node_modules/example/browser.js': `module.exports = 'browser'`,
    '/worker-workspace/node_modules/example/package.json': `{"exports":{"browser":"./browser.js","worker":"./worker.js"}}`,
    '/worker-workspace/node_modules/example/worker.js': `module.exports = 'worker'`,
  })
  const graph = await LoadEslintConfig.loadEslintConfig(
    '/worker-workspace/eslint.config.js',
  )
  expect(graph.resolutions['/worker-workspace/eslint.config.js\0example']).toBe(
    '/worker-workspace/node_modules/example/worker.js',
  )
})

test('resolves a scoped package', async () => {
  setFiles({
    '/workspace/eslint.config.js': `module.exports = require('@scope/eslint-config')`,
    '/workspace/node_modules/@scope/eslint-config/index.cjs': `module.exports = []`,
    '/workspace/node_modules/@scope/eslint-config/package.json': `{"main":"index.cjs"}`,
  })
  const graph = await LoadEslintConfig.loadEslintConfig(
    '/workspace/eslint.config.js',
  )
  expect(
    graph.resolutions['/workspace/eslint.config.js\0@scope/eslint-config'],
  ).toBe('/workspace/node_modules/@scope/eslint-config/index.cjs')
})

test('resolves a package subpath export', async () => {
  setFiles({
    '/workspace/eslint.config.js': `module.exports = require('example/recommended')`,
    '/workspace/node_modules/example/configs/recommended.js': `module.exports = []`,
    '/workspace/node_modules/example/package.json': `{"exports":{"./recommended":"./configs/recommended.js"}}`,
  })
  const graph = await LoadEslintConfig.loadEslintConfig(
    '/workspace/eslint.config.js',
  )
  expect(
    graph.resolutions['/workspace/eslint.config.js\0example/recommended'],
  ).toBe('/workspace/node_modules/example/configs/recommended.js')
})

test('preloads json modules without transforming them', async () => {
  setFiles({
    '/workspace/eslint.config.js': `module.exports = require('./rules.json')`,
    '/workspace/rules.json': `[{"rules":{"semi":"error"}}]`,
  })
  const graph = await LoadEslintConfig.loadEslintConfig(
    '/workspace/eslint.config.js',
  )
  expect(graph.modules['/workspace/rules.json']).toBe(
    `[{"rules":{"semi":"error"}}]`,
  )
})

test('preloads package manifests for sandbox file reads', async () => {
  setFiles({
    '/manifest-workspace/eslint.config.js': `module.exports = require('plugin')`,
    '/manifest-workspace/node_modules/plugin/index.js': `const fs = require('fs'); const path = require('path'); module.exports = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8')).name`,
    '/manifest-workspace/node_modules/plugin/package.json': `{"main":"index.js","name":"plugin"}`,
  })
  const graph = await LoadEslintConfig.loadEslintConfig(
    '/manifest-workspace/eslint.config.js',
  )

  expect(
    graph.files['/manifest-workspace/node_modules/plugin/package.json'],
  ).toBe(`{"main":"index.js","name":"plugin"}`)
})

test('preloads support files referenced by a config', async () => {
  setFiles({
    '/support-workspace/.eslint-ignore': `dist`,
    '/support-workspace/eslint.config.js': `import fs from 'fs'; import path from 'path'; export default fs.readFileSync(path.join(import.meta.dirname, '.eslint-ignore'), 'utf8')`,
  })
  const graph = await LoadEslintConfig.loadEslintConfig(
    '/support-workspace/eslint.config.js',
  )

  expect(graph.files['/support-workspace/.eslint-ignore']).toBe('dist')
})

test('allows an explicitly supported node builtin', async () => {
  setFiles({
    '/workspace/eslint.config.js': `const path = require('node:path'); module.exports = [{ name: path.basename('/a/b') }]`,
  })
  const graph = await LoadEslintConfig.loadEslintConfig(
    '/workspace/eslint.config.js',
  )
  expect(graph.resolutions['/workspace/eslint.config.js\0node:path']).toBe(
    'node:path',
  )
})

test('allows the worker_threads builtin', async () => {
  setFiles({
    '/workspace/eslint.config.js': `const workerThreads = require('node:worker_threads'); module.exports = [{ name: String(workerThreads.isMainThread) }]`,
  })
  const graph = await LoadEslintConfig.loadEslintConfig(
    '/workspace/eslint.config.js',
  )
  expect(
    graph.resolutions['/workspace/eslint.config.js\0node:worker_threads'],
  ).toBe('node:worker_threads')
})

test('allows the vm builtin', async () => {
  setFiles({
    '/workspace/eslint.config.js': `module.exports = require('vm')`,
  })
  const graph = await LoadEslintConfig.loadEslintConfig(
    '/workspace/eslint.config.js',
  )
  expect(graph.resolutions['/workspace/eslint.config.js\0vm']).toBe('node:vm')
})

test('allows the tty builtin', async () => {
  setFiles({
    '/workspace/eslint.config.js': `module.exports = require('tty')`,
  })
  const graph = await LoadEslintConfig.loadEslintConfig(
    '/workspace/eslint.config.js',
  )
  expect(graph.resolutions['/workspace/eslint.config.js\0tty']).toBe('node:tty')
})

test('allows the stream builtin', async () => {
  setFiles({
    '/workspace/eslint.config.js': `module.exports = require('stream')`,
  })
  const graph = await LoadEslintConfig.loadEslintConfig(
    '/workspace/eslint.config.js',
  )
  expect(graph.resolutions['/workspace/eslint.config.js\0stream']).toBe(
    'node:stream',
  )
})

test('allows child_process through a non-executing sandbox shim', async () => {
  setFiles({
    '/workspace/eslint.config.js': `module.exports = require('node:child_process')`,
  })
  const graph = await LoadEslintConfig.loadEslintConfig(
    '/workspace/eslint.config.js',
  )
  expect(
    graph.resolutions['/workspace/eslint.config.js\0node:child_process'],
  ).toBe('node:child_process')
})

test('rejects a blocked node builtin', async () => {
  setFiles({
    '/workspace/eslint.config.js': `module.exports = require('node:http')`,
  })
  await expect(
    LoadEslintConfig.loadEslintConfig('/workspace/eslint.config.js'),
  ).rejects.toThrow(
    "Cannot resolve module 'node:http' from /workspace/eslint.config.js",
  )
})

test('rejects a missing dependency with its importer', async () => {
  setFiles({
    '/workspace/eslint.config.js': `module.exports = require('missing-plugin')`,
  })
  await expect(
    LoadEslintConfig.loadEslintConfig('/workspace/eslint.config.js'),
  ).rejects.toThrow(
    "Cannot resolve module 'missing-plugin' from /workspace/eslint.config.js",
  )
})

test('allows a missing optional dependency inside try-catch', async () => {
  setFiles({
    '/workspace/eslint.config.js': `try { require('optional-plugin') } catch {} module.exports = []`,
  })
  const graph = await LoadEslintConfig.loadEslintConfig(
    '/workspace/eslint.config.js',
  )
  expect(graph.resolutions).toEqual({})
})

test('resolves positive and missing candidates from cached directory entries', async () => {
  setFiles({
    '/directory-cache-workspace/eslint.config.js': `try { require('missing-plugin/subpath') } catch {} module.exports = require('./plugin')`,
    '/directory-cache-workspace/plugin.js': `module.exports = []`,
  })
  const readDirectory = jest.fn(readDirWithFileTypes)
  const statFile = jest.fn(stat)
  FileSystem.state.api = {
    readDirWithFileTypes: readDirectory,
    readFile,
    stat: statFile,
  }

  const graph = await LoadEslintConfig.loadEslintConfig(
    '/directory-cache-workspace/eslint.config.js',
  )

  expect(
    Object.hasOwn(graph.modules, '/directory-cache-workspace/plugin.js'),
  ).toBe(true)
  expect(graph.resolutions).not.toHaveProperty(
    '/directory-cache-workspace/eslint.config.js\0missing-plugin/subpath',
  )
  expect(statFile).not.toHaveBeenCalled()
  expect(readDirectory).toHaveBeenCalledWith(
    'file:///directory-cache-workspace',
  )
})

test('does not inspect ambiguous ancestors above the config directory', async () => {
  setFiles({
    '/var/workspace/eslint.config.js': `module.exports = require('./plugin')`,
    '/var/workspace/plugin.js': `module.exports = []`,
  })
  const readDirectory = jest.fn(async (uri: string) => {
    if (uri === 'file:///') {
      return [{ isDirectory: false, isFile: false, name: 'var' }]
    }
    return readDirWithFileTypes(uri)
  })
  const statFile = jest.fn(stat)
  FileSystem.state.api = {
    readDirWithFileTypes: readDirectory,
    readFile,
    stat: statFile,
  }

  const graph = await LoadEslintConfig.loadEslintConfig(
    '/var/workspace/eslint.config.js',
  )

  expect(Object.hasOwn(graph.modules, '/var/workspace/plugin.js')).toBe(true)
  expect(statFile).not.toHaveBeenCalled()
  expect(readDirectory).not.toHaveBeenCalledWith('file:///')
})

test('stops directory traversal at the config directory on windows', async () => {
  setFiles({
    '/C:/workspace/eslint.config.js': `module.exports = require('./plugin')`,
    '/C:/workspace/plugin.js': `module.exports = []`,
  })
  const readDirectory = jest.fn(readDirWithFileTypes)
  const statFile = jest.fn(stat)
  FileSystem.state.api = {
    readDirWithFileTypes: readDirectory,
    readFile,
    stat: statFile,
  }

  const graph = await LoadEslintConfig.loadEslintConfig(
    '/C:/workspace/eslint.config.js',
  )

  expect(Object.hasOwn(graph.modules, '/C:/workspace/plugin.js')).toBe(true)
  expect(readDirectory).toHaveBeenCalledWith('file:///C:/workspace')
  expect(readDirectory).not.toHaveBeenCalledWith('file:///C:/')
  expect(readDirectory).not.toHaveBeenCalledWith('file:///')
  expect(statFile).not.toHaveBeenCalled()
})

test('stats a windows short-name path that is absent from directory entries', async () => {
  setFiles({
    '/C:/Users/RUNNER~1/AppData/Local/Temp/project/node_modules/eslint/index.js':
      'module.exports = { Linter: class {} }',
    '/C:/Users/RUNNER~1/AppData/Local/Temp/project/node_modules/eslint/package.json':
      '{"main":"index.js"}',
  })
  const readDirectory = jest.fn(async (uri: string) => {
    if (uri === 'file:///C:/Users') {
      return [{ isDirectory: true, isFile: false, name: 'runner' }]
    }
    return readDirWithFileTypes(uri)
  })
  const statFile = jest.fn(stat)
  FileSystem.state.api = {
    readDirWithFileTypes: readDirectory,
    readFile,
    stat: statFile,
  }

  const graph = await LoadEslintConfig.loadEslintModule(
    '/C:/Users/RUNNER~1/AppData/Local/Temp/project/test.js',
  )

  expect(graph.entry).toBe(
    '/C:/Users/RUNNER~1/AppData/Local/Temp/project/node_modules/eslint/index.js',
  )
  expect(statFile.mock.calls).toEqual([
    ['file:///C:/Users/RUNNER~1'],
    ['file:///C:/Users/RUNNER~1'],
  ])
})

test('does not preload require examples from comments', async () => {
  setFiles({
    '/workspace/eslint.config.js': `// Example: require('not-installed')\nmodule.exports = []`,
  })
  const graph = await LoadEslintConfig.loadEslintConfig(
    '/workspace/eslint.config.js',
  )
  expect(graph.resolutions).toEqual({})
})

test('does not preload require examples from strings', async () => {
  setFiles({
    '/workspace/eslint.config.js': `module.exports = [{ message: "Use require('not-installed') here" }]`,
  })
  const graph = await LoadEslintConfig.loadEslintConfig(
    '/workspace/eslint.config.js',
  )
  expect(graph.resolutions).toEqual({})
})

test('does not preload lazy function dependencies', async () => {
  setFiles({
    '/workspace/eslint.config.js': `const load = () => require('loaded-later'); module.exports = []`,
  })
  const graph = await LoadEslintConfig.loadEslintConfig(
    '/workspace/eslint.config.js',
  )
  expect(graph.resolutions).toEqual({})
})

test('preloads dependencies of an exported commonjs function', async () => {
  setFiles({
    '/exported-function-workspace/dependency.js': `module.exports = true`,
    '/exported-function-workspace/eslint.config.js': `function setup() { return require('./dependency') } module.exports = setup`,
  })
  const graph = await LoadEslintConfig.loadEslintConfig(
    '/exported-function-workspace/eslint.config.js',
  )
  expect(
    graph.resolutions[
      '/exported-function-workspace/eslint.config.js\0./dependency'
    ],
  ).toBe('/exported-function-workspace/dependency.js')
})

test('preloads dependencies of a named commonjs export', async () => {
  setFiles({
    '/named-export-workspace/dependency.js': `module.exports = true`,
    '/named-export-workspace/eslint.config.js': `module.exports = require('./service')`,
    '/named-export-workspace/service.js': `exports.createService = createService; function createService() { return require('./dependency') }`,
  })
  const graph = await LoadEslintConfig.loadEslintConfig(
    '/named-export-workspace/eslint.config.js',
  )
  expect(
    graph.resolutions['/named-export-workspace/service.js\0./dependency'],
  ).toBe('/named-export-workspace/dependency.js')
})

test('preloads dependencies from an immediately invoked function', async () => {
  setFiles({
    '/iife-workspace/dependency.js': `module.exports = []`,
    '/iife-workspace/eslint.config.js': `(function () { module.exports = require('./dependency') }).call(this)`,
  })
  const graph = await LoadEslintConfig.loadEslintConfig(
    '/iife-workspace/eslint.config.js',
  )
  expect(
    graph.resolutions['/iife-workspace/eslint.config.js\0./dependency'],
  ).toBe('/iife-workspace/dependency.js')
})

test('preloads dependencies referenced by require.resolve', async () => {
  setFiles({
    '/resolve-workspace/eslint.config.js': `module.exports = require.resolve('./worker')`,
    '/resolve-workspace/worker.js': `module.exports = true`,
  })
  const graph = await LoadEslintConfig.loadEslintConfig(
    '/resolve-workspace/eslint.config.js',
  )
  expect(
    graph.resolutions['/resolve-workspace/eslint.config.js\0./worker'],
  ).toBe('/resolve-workspace/worker.js')
})

test('preloads modules discovered by a top-level readdirSync call', async () => {
  setFiles({
    '/readdir-workspace/eslint.config.js': `module.exports = require('plugin')`,
    '/readdir-workspace/node_modules/plugin/index.js': `const fs = require('fs'); fs.readdirSync(__dirname + '/rules'); module.exports = []`,
    '/readdir-workspace/node_modules/plugin/package.json': `{"main":"index.js"}`,
    '/readdir-workspace/node_modules/plugin/rules/first.js': `module.exports = true`,
  })
  const graph = await LoadEslintConfig.loadEslintConfig(
    '/readdir-workspace/eslint.config.js',
  )
  expect(
    graph.modules['/readdir-workspace/node_modules/plugin/rules/first.js'],
  ).toBe('module.exports = true')
})

test('preloads typescript modules discovered by a top-level glob sync call', async () => {
  setFiles({
    '/glob-workspace/eslint.config.js': `import plugin from './plugin/index.ts'; export default [plugin]`,
    '/glob-workspace/node_modules/glob/index.js': `module.exports = { sync: () => [] }`,
    '/glob-workspace/node_modules/glob/package.json': `{"main":"index.js"}`,
    '/glob-workspace/plugin/first.ts': `export default true`,
    '/glob-workspace/plugin/index.ts': `import glob from 'glob'; glob.sync('*.ts'); export default {}`,
    '/glob-workspace/plugin/tests/failing.ts': `import './missing.ts'`,
    '/glob-workspace/plugin/types.d.ts': `export type Missing = import('./missing').Missing`,
  })
  const graph = await LoadEslintConfig.loadEslintConfig(
    '/glob-workspace/eslint.config.js',
  )
  expect(graph.modules['/glob-workspace/plugin/first.ts']).toContain(
    'exports.default',
  )
  expect(graph.modules).not.toHaveProperty('/glob-workspace/plugin/types.d.ts')
  expect(graph.modules).not.toHaveProperty(
    '/glob-workspace/plugin/tests/failing.ts',
  )
})

test('preloads sibling modules referenced by a LazyLoadingRuleMap', async () => {
  setFiles({
    '/lazy-map-workspace/eslint.config.js': `module.exports = require('./rules')`,
    '/lazy-map-workspace/first.js': `module.exports = true`,
    '/lazy-map-workspace/rules.js': `const LazyLoadingRuleMap = class {}; module.exports = new LazyLoadingRuleMap([['first', () => require('./first')]])`,
  })
  const graph = await LoadEslintConfig.loadEslintConfig(
    '/lazy-map-workspace/eslint.config.js',
  )
  expect(graph.modules['/lazy-map-workspace/first.js']).toBe(
    'module.exports = true',
  )
})

test('handles circular dependencies', async () => {
  setFiles({
    '/workspace/a.js': `require('./b.js'); module.exports = []`,
    '/workspace/b.js': `require('./a.js')`,
    '/workspace/eslint.config.js': `module.exports = require('./a.js')`,
  })
  const graph = await LoadEslintConfig.loadEslintConfig(
    '/workspace/eslint.config.js',
  )
  expect(Object.keys(graph.modules)).toHaveLength(3)
})

test('loads the closest project ESLint package as a graph', async () => {
  setFiles({
    '/workspace/node_modules/eslint/index.js':
      'class ProjectLinter {}; module.exports = { Linter: ProjectLinter }',
    '/workspace/node_modules/eslint/package.json': '{"main":"index.js"}',
  })

  const graph = await LoadEslintConfig.loadEslintModule(
    '/workspace/src/file.js',
  )

  expect(graph.entry).toBe('/workspace/node_modules/eslint/index.js')
  expect(graph.modules[graph.entry]).toContain('ProjectLinter')
})

test('does not read above the ESLint config directory when locating ESLint', async () => {
  setFiles({
    '/workspace/node_modules/eslint/index.js':
      'class ProjectLinter {}; module.exports = { Linter: ProjectLinter }',
    '/workspace/node_modules/eslint/package.json': '{"main":"index.js"}',
  })
  const readDirectory = jest.fn(readDirWithFileTypes)
  FileSystem.state.api = {
    readDirWithFileTypes: readDirectory,
    readFile,
    stat,
  }

  const graph = await LoadEslintConfig.loadEslintModule(
    '/workspace/src/file.js',
    '/workspace/eslint.config.js',
  )

  expect(graph.entry).toBe('/workspace/node_modules/eslint/index.js')
  expect(readDirectory).toHaveBeenCalled()
  expect(
    readDirectory.mock.calls.every(
      ([uri]) =>
        uri === 'file:///workspace' || uri.startsWith('file:///workspace/'),
    ),
  ).toBe(true)
})

test('does not resolve config dependencies above the config directory', async () => {
  setFiles({
    '/node_modules/outside-plugin/index.js': 'module.exports = []',
    '/node_modules/outside-plugin/package.json': '{"main":"index.js"}',
    '/workspace/eslint.config.js': `try { require('outside-plugin') } catch {} module.exports = []`,
  })
  const readDirectory = jest.fn(readDirWithFileTypes)
  FileSystem.state.api = {
    readDirWithFileTypes: readDirectory,
    readFile,
    stat,
  }

  const graph = await LoadEslintConfig.loadEslintConfig(
    '/workspace/eslint.config.js',
  )

  expect(graph.resolutions).not.toHaveProperty(
    '/workspace/eslint.config.js\0outside-plugin',
  )
  expect(readDirectory).toHaveBeenCalled()
  expect(
    readDirectory.mock.calls.every(
      ([uri]) =>
        uri === 'file:///workspace' || uri.startsWith('file:///workspace/'),
    ),
  ).toBe(true)
})

test('allows explicitly absolute config dependencies outside the config directory', async () => {
  setFiles({
    '/external/nested.js': 'module.exports = []',
    '/external/plugin.js': `module.exports = require('./nested')`,
    '/workspace/eslint.config.js': `module.exports = require('/external/plugin')`,
  })

  const graph = await LoadEslintConfig.loadEslintConfig(
    '/workspace/eslint.config.js',
  )

  expect(graph.resolutions).toMatchObject({
    '/external/plugin.js\0./nested': '/external/nested.js',
    '/workspace/eslint.config.js\0/external/plugin': '/external/plugin.js',
  })
})

test('loads ESLint when a non-file filesystem does not implement stat', async () => {
  const files: Record<string, string> = {
    'html:///workspace/node_modules/eslint/index.js':
      'class ProjectLinter {}; module.exports = { Linter: ProjectLinter }',
    'html:///workspace/node_modules/eslint/package.json': '{"main":"index.js"}',
  }
  FileSystem.state.api = {
    readDirWithFileTypes: async (uri: string) => {
      const prefix = `${uri.replace(/\/$/, '')}/`
      const entries = new Map<
        string,
        { isDirectory: boolean; isFile: boolean; name: string }
      >()
      for (const file of Object.keys(files)) {
        if (!file.startsWith(prefix)) {
          continue
        }
        const relative = file.slice(prefix.length)
        const slashIndex = relative.indexOf('/')
        const name =
          slashIndex === -1 ? relative : relative.slice(0, slashIndex)
        entries.set(name, {
          isDirectory: slashIndex !== -1,
          isFile: slashIndex === -1,
          name,
        })
      }
      return entries.values().toArray()
    },
    readFile: async (uri: string) => files[uri],
    stat: async () => {
      throw new Error('stat is not implemented')
    },
  }

  const graph = await LoadEslintConfig.loadEslintModule(
    'html:///workspace/src/file.js',
  )

  expect(graph.entry).toBe('html:///workspace/node_modules/eslint/index.js')
  expect(graph.modules[graph.entry]).toContain('ProjectLinter')
})

test('reports when ESLint is not installed in the project', async () => {
  await expect(
    LoadEslintConfig.loadEslintModule('/missing-workspace/src/file.js'),
  ).rejects.toThrow(
    'Cannot find ESLint in project node_modules for /missing-workspace/src/file.js',
  )
})

test('keeps a stable graph id for cached results', async () => {
  setFiles({
    '/graph-id-workspace/eslint.config.js': 'module.exports = []',
  })

  const first = await LoadEslintConfig.loadEslintConfig(
    '/graph-id-workspace/eslint.config.js',
  )
  const second = await LoadEslintConfig.loadEslintConfig(
    '/graph-id-workspace/eslint.config.js',
  )

  expect(second.id).toBe(first.id)
})
