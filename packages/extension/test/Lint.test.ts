import { expect, test } from '@jest/globals'
import { Linter } from 'eslint'
import type { ModuleGraph } from '../src/parts/ModuleGraph/ModuleGraph.ts'
import * as Lint from '../src/parts/Lint/Lint.ts'

const createGraph = (config: string): ModuleGraph => ({
  entry: '/workspace/eslint.config.js',
  modules: { '/workspace/eslint.config.js': config },
  resolutions: {},
})

test('uses the secure default config when no project config exists', async () => {
  const results = await Lint.lint(
    'debugger',
    '/workspace/file.js',
    undefined,
    Linter,
  )
  expect(results).toEqual([
    expect.objectContaining({ ruleId: 'no-debugger', severity: 'error' }),
  ])
})

test('uses rules from a loaded flat config', async () => {
  const results = await Lint.lint(
    'if (value == null) {}',
    '/workspace/file.js',
    createGraph(
      `module.exports = [{ languageOptions: { globals: { value: 'readonly' } }, rules: { eqeqeq: 'error' } }]`,
    ),
    Linter,
  )
  expect(results).toEqual([
    expect.objectContaining({ ruleId: 'eqeqeq', severity: 'error' }),
  ])
})

test('runs a dynamically loaded plugin rule', async () => {
  const configPath = '/workspace/eslint.config.js'
  const pluginPath = '/workspace/node_modules/eslint-plugin-demo/index.js'
  const graph: ModuleGraph = {
    entry: configPath,
    modules: {
      [configPath]: `const demo = require('eslint-plugin-demo'); module.exports = [{ plugins: { demo }, rules: { 'demo/no-foo': 'error' } }]`,
      [pluginPath]: `module.exports = { rules: { 'no-foo': { create(context) { return { Identifier(node) { if (node.name === 'foo') context.report({ node, message: 'Do not use foo' }) } } } } } }`,
    },
    resolutions: {
      [`${configPath}\0eslint-plugin-demo`]: pluginPath,
    },
  }
  const results = await Lint.lint(
    'const foo = 1',
    '/workspace/file.js',
    graph,
    Linter,
  )
  expect(results).toEqual([
    expect.objectContaining({
      message: 'Do not use foo',
      ruleId: 'demo/no-foo',
      severity: 'error',
    }),
  ])
})

test('passes an absolute file path to parser services', async () => {
  const configPath = '/workspace/eslint.config.js'
  const graph: ModuleGraph = {
    entry: configPath,
    modules: {
      [configPath]: `module.exports = [{ files: ['**/*.ts'], plugins: { test: { rules: { filename: { create(context) { return { Program(node) { context.report({ node, message: context.filename }) } } } } } } }, rules: { 'test/filename': 'error' } }]`,
    },
    resolutions: {},
  }
  const results = await Lint.lint(
    '',
    '/workspace/source/file.ts',
    graph,
    Linter,
  )
  expect(results[0].message).toBe('/workspace/source/file.ts')
})

test('preserves warning severity and source locations', async () => {
  const results = await Lint.lint(
    'const unused = 1',
    '/workspace/file.js',
    createGraph(`module.exports = [{ rules: { 'no-unused-vars': 'warn' } }]`),
    Linter,
  )
  expect(results[0]).toEqual(
    expect.objectContaining({
      column: 7,
      line: 1,
      ruleId: 'no-unused-vars',
      severity: 'warning',
    }),
  )
})

test('returns no diagnostics for a file ignored by flat config', async () => {
  const results = await Lint.lint(
    'console.log("ignored")',
    '/workspace/ignored/file.js',
    createGraph(
      `module.exports = [{ ignores: ['ignored/**'] }, { files: ['**/*.js'], rules: { 'no-console': 'error' } }]`,
    ),
    Linter,
  )
  expect(results).toEqual([])
})

test('preserves fixes returned by ESLint rules', async () => {
  const results = await Lint.lint(
    'const value = "test"',
    '/workspace/file.js',
    createGraph(
      `module.exports = [{ rules: { quotes: ['error', 'single'] } }]`,
    ),
    Linter,
  )

  expect(results[0]).toEqual(
    expect.objectContaining({
      fix: {
        range: [14, 20],
        text: "'test'",
      },
      ruleId: 'quotes',
    }),
  )
})
