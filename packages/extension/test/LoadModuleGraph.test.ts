import { expect, test } from '@jest/globals'
import type { ModuleGraph } from '../src/parts/ModuleGraph/ModuleGraph.ts'
import * as LoadModuleGraph from '../src/parts/LoadModuleGraph/LoadModuleGraph.ts'

const graph = (
  modules: Record<string, string>,
  resolutions: Record<string, string> = {},
): ModuleGraph => ({
  entry: '/workspace/eslint.config.js',
  modules,
  resolutions,
})

test('loads a commonjs config', () => {
  const value = LoadModuleGraph.loadModuleGraph(
    graph({
      '/workspace/eslint.config.js': `module.exports = [{ rules: {} }]`,
    }),
  )
  expect(value).toEqual([{ rules: {} }])
})

test('unwraps a babel esm default export', () => {
  const value = LoadModuleGraph.loadModuleGraph(
    graph({
      '/workspace/eslint.config.js': `Object.defineProperty(exports, '__esModule', { value: true }); exports.default = [{ rules: {} }]`,
    }),
  )
  expect(value).toEqual([{ rules: {} }])
})

test('loads a relative dependency', () => {
  const value = LoadModuleGraph.loadModuleGraph(
    graph(
      {
        '/workspace/eslint.config.js': `module.exports = require('./rules.js')`,
        '/workspace/rules.js': `module.exports = [{ rules: { semi: 'error' } }]`,
      },
      {
        '/workspace/eslint.config.js\0./rules.js': '/workspace/rules.js',
      },
    ),
  )
  expect(value[0].rules.semi).toBe('error')
})

test('loads a json dependency', () => {
  const value = LoadModuleGraph.loadModuleGraph(
    graph(
      {
        '/workspace/config.json': `[{"rules":{"eqeqeq":"warn"}}]`,
        '/workspace/eslint.config.js': `module.exports = require('./config.json')`,
      },
      {
        '/workspace/eslint.config.js\0./config.json': '/workspace/config.json',
      },
    ),
  )
  expect(value[0].rules.eqeqeq).toBe('warn')
})

test('supports circular commonjs modules', () => {
  const value = LoadModuleGraph.loadModuleGraph(
    graph(
      {
        '/workspace/a.js': `exports.name = 'a'; require('./b.js')`,
        '/workspace/b.js': `require('./a.js')`,
        '/workspace/eslint.config.js': `const a = require('./a.js'); module.exports = [{ name: a.name }]`,
      },
      {
        '/workspace/a.js\0./b.js': '/workspace/b.js',
        '/workspace/b.js\0./a.js': '/workspace/a.js',
        '/workspace/eslint.config.js\0./a.js': '/workspace/a.js',
      },
    ),
  )
  expect(value).toEqual([{ name: 'a' }])
})

test('provides the path shim', () => {
  const value = LoadModuleGraph.loadModuleGraph(
    graph({
      '/workspace/eslint.config.js': `const path = require('node:path'); module.exports = path.basename('/a/file.js', '.js')`,
    }),
  )
  expect(value).toBe('file')
})

test('limits fs reads to preloaded virtual files', () => {
  const value = LoadModuleGraph.loadModuleGraph(
    graph({
      '/workspace/data.json': 'safe',
      '/workspace/eslint.config.js': `const fs = require('node:fs'); module.exports = fs.readFileSync('/workspace/data.json', 'utf8')`,
    }),
  )
  expect(value).toBe('safe')
})

test('rejects fs reads outside the virtual graph', () => {
  expect(() =>
    LoadModuleGraph.loadModuleGraph(
      graph({
        '/workspace/eslint.config.js': `require('node:fs').readFileSync('/etc/passwd', 'utf8')`,
      }),
    ),
  ).toThrow('Virtual file is not available: /etc/passwd')
})

test('rejects modules absent from the graph', () => {
  expect(() =>
    LoadModuleGraph.loadModuleGraph(
      graph({
        '/workspace/eslint.config.js': `module.exports = require('child_process')`,
      }),
    ),
  ).toThrow("Module 'child_process' was not preloaded")
})
