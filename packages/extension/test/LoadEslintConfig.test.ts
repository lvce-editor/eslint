/* eslint-disable unicorn/no-global-object-property-assignment */
import { beforeEach, expect, test } from '@jest/globals'
import * as LoadEslintConfig from '../src/parts/LoadEslintConfig/LoadEslintConfig.ts'

const state: { files: Record<string, string> } = { files: {} }

const setFiles = (value: Record<string, string>): void => {
  state.files = value
}

beforeEach(() => {
  state.files = {}
  // @ts-ignore
  globalThis.vscode = {
    executeCommand: async (method: string, path: string) => {
      if (method === 'FileSystem.readFile') {
        if (!(path in state.files)) {
          throw new Error(`File not found: ${path}`)
        }
        return state.files[path]
      }
      if (method === 'FileSystem.stat') {
        if (path in state.files) {
          return { isDirectory: false, isFile: true }
        }
        const prefix = `${path.replace(/\/$/, '')}/`
        if (Object.keys(state.files).some((file) => file.startsWith(prefix))) {
          return { isDirectory: true, isFile: false }
        }
        throw new Error(`File not found: ${path}`)
      }
      throw new Error(`Unexpected method: ${method}`)
    },
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

test('prefers a package exports import entry', async () => {
  setFiles({
    '/workspace/eslint.config.js': `export { default } from 'eslint-config-example'`,
    '/workspace/node_modules/eslint-config-example/esm.js': `export default []`,
    '/workspace/node_modules/eslint-config-example/package.json': `{"exports":{".":{"import":"./esm.js","require":"./cjs.cjs"}}}`,
  })
  const graph = await LoadEslintConfig.loadEslintConfig(
    '/workspace/eslint.config.js',
  )
  expect(
    graph.resolutions['/workspace/eslint.config.js\0eslint-config-example'],
  ).toBe('/workspace/node_modules/eslint-config-example/esm.js')
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

test('rejects a blocked node builtin', async () => {
  setFiles({
    '/workspace/eslint.config.js': `module.exports = require('node:child_process')`,
  })
  await expect(
    LoadEslintConfig.loadEslintConfig('/workspace/eslint.config.js'),
  ).rejects.toThrow(
    "Cannot resolve module 'node:child_process' from /workspace/eslint.config.js",
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
