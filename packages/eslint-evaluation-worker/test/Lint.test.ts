import { expect, test } from '@jest/globals'
import { ESLint, Linter } from 'eslint'
import type { EvaluatedModuleGraph } from '../src/parts/LoadModuleGraph/LoadModuleGraph.ts'
import type { ModuleGraph } from '../src/parts/ModuleGraph/ModuleGraph.ts'
import * as Lint from '../src/parts/Lint/Lint.ts'
import * as LoadModuleGraph from '../src/parts/LoadModuleGraph/LoadModuleGraph.ts'

// cspell:ignore mistkae

const eslint = { ESLint, Linter }

const evaluate = (graph: ModuleGraph): EvaluatedModuleGraph =>
  LoadModuleGraph.createModuleRuntime().evaluate(graph)

const createGraph = (config: string, id = config): EvaluatedModuleGraph =>
  evaluate({
    entry: '/workspace/eslint.config.js',
    id,
    modules: { '/workspace/eslint.config.js': config },
    resolutions: {},
  })

test('uses the secure default config when no project config exists', async () => {
  const results = await Lint.lint(
    'debugger',
    '/workspace/file.js',
    undefined,
    eslint,
  )
  expect(results).toEqual([
    expect.objectContaining({ ruleId: 'no-debugger', severity: 'error' }),
  ])
})

test('converts a virtual document uri to an absolute linter path', async () => {
  const results = await Lint.lint(
    'debugger',
    'memfs:///workspace/file.js',
    undefined,
    eslint,
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
    eslint,
  )
  expect(results).toEqual([
    expect.objectContaining({ ruleId: 'eqeqeq', severity: 'error' }),
  ])
})

test('runs a dynamically loaded plugin rule', async () => {
  const configPath = '/workspace/eslint.config.js'
  const pluginPath = '/workspace/node_modules/eslint-plugin-demo/index.js'
  const graph = evaluate({
    entry: configPath,
    id: 'plugin-graph',
    modules: {
      [configPath]: `const demo = require('eslint-plugin-demo'); module.exports = [{ plugins: { demo }, rules: { 'demo/no-foo': 'error' } }]`,
      [pluginPath]: `module.exports = { rules: { 'no-foo': { create(context) { return { Identifier(node) { if (node.name === 'foo') context.report({ node, message: 'Do not use foo' }) } } } } } }`,
    },
    resolutions: {
      [`${configPath}\0eslint-plugin-demo`]: pluginPath,
    },
  })
  const results = await Lint.lint(
    'const foo = 1',
    '/workspace/file.js',
    graph,
    eslint,
  )
  expect(results).toEqual([
    expect.objectContaining({
      message: 'Do not use foo',
      ruleId: 'demo/no-foo',
      severity: 'error',
    }),
  ])
})

test('replays only cspell after deferred checking completes', async () => {
  const configPath = '/workspace/eslint.config.js'
  const workerPath = '/workspace/worker.js'
  const graph = evaluate({
    entry: configPath,
    id: 'deferred-cspell-graph',
    modules: {
      '/workspace/checker.js': `exports.check = async value => ({ errors: [], issues: [value] })`,
      [configPath]: `const { createSyncFn } = require('synckit'); const check = createSyncFn(require.resolve('./worker.js')); const plugin = { rules: { spellchecker: { create(context) { return { Program(node) { if (check('mistkae').issues.length) context.report({ node, message: 'spelling issue' }) } } } } } }; module.exports = [{ plugins: { '@cspell': plugin }, rules: { '@cspell/spellchecker': 'error', 'no-debugger': 'error' } }]`,
      [workerPath]: `const { runAsWorker } = require('synckit'); runAsWorker(async value => require('./checker.js').check(value))`,
    },
    resolutions: {
      [`${configPath}\0./worker.js`]: workerPath,
      [`${configPath}\0synckit`]: 'compat:cspell-deferred-sync',
      [`${workerPath}\0./checker.js`]: '/workspace/checker.js',
      [`${workerPath}\0synckit`]: 'compat:cspell-deferred-sync',
    },
  })

  const results = await Lint.lint(
    'debugger',
    '/workspace/file.js',
    graph,
    eslint,
  )
  expect(results.map(({ ruleId }) => ruleId)).toEqual([
    '@cspell/spellchecker',
    'no-debugger',
  ])
})

test('reuses loaded config modules until the graph changes', async () => {
  const configPath = '/workspace/eslint.config.js'
  const pluginPath = '/workspace/plugin.js'
  const createCountingGraph = (id: string): EvaluatedModuleGraph =>
    evaluate({
      entry: configPath,
      files: {},
      id,
      modules: {
        [configPath]: `const plugin = require('./plugin.js'); module.exports = [{ plugins: { test: plugin }, rules: { 'test/count': 'error' } }]`,
        [pluginPath]: `let count = 0; module.exports = { rules: { count: { create(context) { const message = String(++count); return { Program(node) { context.report({ node, message }) } } } } } }`,
      },
      resolutions: {
        [`${configPath}\0./plugin.js`]: pluginPath,
      },
    })
  const graph = createCountingGraph('reused-graph')

  const first = await Lint.lint('', '/workspace/file.js', graph, eslint)
  const second = await Lint.lint('', '/workspace/file.js', graph, eslint)
  const reloaded = await Lint.lint(
    '',
    '/workspace/file.js',
    createCountingGraph('reloaded-graph'),
    eslint,
  )

  expect(first[0].message).toBe('1')
  expect(second[0].message).toBe('2')
  expect(reloaded[0].message).toBe('1')
})

test('reuses the ESLint engine for the same graph', async () => {
  let constructions = 0
  class CountingEslint extends ESLint {
    static readonly version = '10.0.0'

    constructor(options: ConstructorParameters<typeof ESLint>[0]) {
      super(options)
      constructions++
    }
  }
  const countingEslint = { ESLint: CountingEslint, Linter }
  const graph = createGraph(`module.exports = [{ rules: {} }]`)

  await Lint.lint('', '/workspace/file.js', graph, countingEslint)
  await Lint.lint('', '/workspace/file.js', graph, countingEslint)
  await Lint.lint(
    '',
    '/workspace/file.js',
    createGraph(`module.exports = [{ rules: {} }]`, 'different-graph'),
    countingEslint,
  )

  expect(constructions).toBe(2)
})

test('falls back to a cached Linter for ESLint 8', async () => {
  let constructions = 0
  class OldEslint extends ESLint {
    static readonly version = '8.57.0'
  }
  class CountingLinter extends Linter {
    constructor(options: ConstructorParameters<typeof Linter>[0]) {
      super(options)
      constructions++
    }
  }
  const legacyEslint = { ESLint: OldEslint, Linter: CountingLinter }
  const graph = createGraph(`module.exports = [{ rules: {} }]`)

  await Lint.lint('', '/workspace/file.js', graph, legacyEslint)
  await Lint.lint('', '/workspace/file.js', graph, legacyEslint)

  expect(constructions).toBe(1)
})

test('passes an absolute file path to parser services', async () => {
  const configPath = '/workspace/eslint.config.js'
  const graph = evaluate({
    entry: configPath,
    id: 'parser-services-graph',
    modules: {
      [configPath]: `module.exports = [{ files: ['**/*.ts'], plugins: { test: { rules: { filename: { create(context) { return { Program(node) { context.report({ node, message: context.filename }) } } } } } } }, rules: { 'test/filename': 'error' } }]`,
    },
    resolutions: {},
  })
  const results = await Lint.lint(
    '',
    '/workspace/source/file.ts',
    graph,
    eslint,
  )
  expect(results[0].message.replaceAll('\\', '/')).toMatch(
    /\/workspace\/source\/file\.ts$/,
  )
})

test('preserves warning severity and source locations', async () => {
  const results = await Lint.lint(
    'const unused = 1',
    '/workspace/file.js',
    createGraph(`module.exports = [{ rules: { 'no-unused-vars': 'warn' } }]`),
    eslint,
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
    eslint,
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
    eslint,
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

test('applies loaded bulk suppressions', async () => {
  const results = await Lint.lint(
    'debugger; missing',
    '/workspace/src/file.js',
    createGraph(
      `module.exports = [{ rules: { 'no-debugger': 'error', 'no-undef': 'error' } }]`,
    ),
    eslint,
    {
      baseDirectory: '/workspace',
      suppressions: {
        'src/file.js': { 'no-debugger': { count: 1 } },
      },
    },
  )

  expect(results.map((result) => result.ruleId)).toEqual(['no-undef'])
})
