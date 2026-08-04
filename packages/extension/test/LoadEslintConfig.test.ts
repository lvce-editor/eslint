import { beforeEach, expect, test } from '@jest/globals'
import * as FileSystem from '../src/parts/FileSystem/FileSystem.ts'
import * as LoadEslintConfig from '../src/parts/LoadEslintConfig/LoadEslintConfig.ts'

const state: { files: Record<string, string> } = { files: {} }

const toPath = (uri: string): string =>
  decodeURIComponent(new URL(uri).pathname)

const readFile = async (uri: string): Promise<string> => {
  const path = toPath(uri)
  if (!(path in state.files)) {
    throw new Error(`File not found: ${path}`)
  }
  return state.files[path]
}

const stat = async (uri: string): Promise<number> => {
  const path = toPath(uri)
  if (path in state.files) {
    return 7
  }
  const prefix = `${path.replace(/\/$/, '')}/`
  if (Object.keys(state.files).some((file) => file.startsWith(prefix))) {
    return 3
  }
  throw new Error(`File not found: ${path}`)
}

const readDirWithFileTypes = async (
  uri: string,
): Promise<Array<{ name: string; type: number }>> => {
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
  return Array.from(entries, ([name, type]) => ({ name, type }))
}

const setFiles = (value: Record<string, string>): void => {
  state.files = value
}

beforeEach(() => {
  state.files = {}
  FileSystem.state.api = {
    readDirWithFileTypes,
    readFile,
    stat,
  }
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

test('replaces import.meta.url for commonjs evaluation', async () => {
  setFiles({
    '/import-meta-workspace/eslint.config.js': `export default import.meta.url`,
  })
  const graph = await LoadEslintConfig.loadEslintConfig(
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
