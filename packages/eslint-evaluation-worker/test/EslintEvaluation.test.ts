import { beforeEach, expect, jest, test } from '@jest/globals'
import type { ModuleGraph } from '../src/parts/ModuleGraph/ModuleGraph.ts'
import * as EslintEvaluation from '../src/parts/EslintEvaluation/EslintEvaluation.ts'

const createGraph = (
  entry: string,
  source: string,
  id: string,
): ModuleGraph => ({
  entry,
  files: {},
  id,
  modules: { [entry]: source },
  resolutions: {},
})

beforeEach(() => {
  EslintEvaluation.clearCache()
})

test('resolves and evaluates the project config and eslint modules', async () => {
  const configGraph = createGraph(
    '/workspace/eslint.config.js',
    `module.exports = [{ rules: {} }]`,
    'config-graph',
  )
  const eslintGraph = createGraph(
    '/workspace/node_modules/eslint/index.js',
    `module.exports = { Linter: class { verify() { return [] } } }`,
    'eslint-graph',
  )
  const loadEslintConfig = jest.fn<
    (path: string, filePath: string) => Promise<ModuleGraph>
  >(async () => configGraph)
  const loadEslintModule = jest.fn<
    (path: string, projectPath?: string) => Promise<ModuleGraph>
  >(async () => eslintGraph)

  await expect(
    EslintEvaluation.lintWithDependencies(
      'const value = 1',
      '/workspace/src/file.js',
      '/workspace/eslint.config.js',
      undefined,
      { loadEslintConfig, loadEslintModule },
    ),
  ).resolves.toEqual([])
  expect(loadEslintConfig).toHaveBeenCalledWith(
    '/workspace/eslint.config.js',
    '/workspace/src/file.js',
  )
  expect(loadEslintModule).toHaveBeenCalledWith(
    '/workspace/src/file.js',
    '/workspace/eslint.config.js',
  )
})

test('uses the default config when no project config exists', async () => {
  const eslintGraph = createGraph(
    '/workspace/node_modules/eslint/index.js',
    `module.exports = { Linter: class { verify() { return [] } } }`,
    'eslint-graph',
  )
  const loadEslintConfig =
    jest.fn<(path: string, filePath: string) => Promise<ModuleGraph>>()
  const loadEslintModule = jest.fn<
    (path: string, projectPath?: string) => Promise<ModuleGraph>
  >(async () => eslintGraph)

  await EslintEvaluation.lintWithDependencies(
    'const value = 1',
    '/workspace/src/file.js',
    undefined,
    undefined,
    { loadEslintConfig, loadEslintModule },
  )

  expect(loadEslintConfig).not.toHaveBeenCalled()
  expect(loadEslintModule).toHaveBeenCalledWith(
    '/workspace/src/file.js',
    undefined,
  )
})

test('reuses config and eslint module graphs while typing', async () => {
  const configGraph = createGraph(
    '/workspace/eslint.config.js',
    `module.exports = [{ rules: {} }]`,
    'config-graph',
  )
  const eslintGraph = createGraph(
    '/workspace/node_modules/eslint/index.js',
    `module.exports = { Linter: class { verify() { return [] } } }`,
    'eslint-graph',
  )
  const loadEslintConfig = jest.fn(async () => configGraph)
  const loadEslintModule = jest.fn(async () => eslintGraph)
  const dependencies = { loadEslintConfig, loadEslintModule }

  await EslintEvaluation.lintWithDependencies(
    'const value = 1',
    '/workspace/src/file.js',
    '/workspace/eslint.config.js',
    undefined,
    dependencies,
  )
  await EslintEvaluation.lintWithDependencies(
    'const value = 2',
    '/workspace/src/file.js',
    '/workspace/eslint.config.js',
    undefined,
    dependencies,
  )

  expect(loadEslintConfig).toHaveBeenCalledTimes(1)
  expect(loadEslintModule).toHaveBeenCalledTimes(1)
})

test('retries a failed graph load', async () => {
  const eslintGraph = createGraph(
    '/workspace/node_modules/eslint/index.js',
    `module.exports = { Linter: class { verify() { return [] } } }`,
    'eslint-graph',
  )
  const loadEslintConfig = jest
    .fn<() => Promise<ModuleGraph>>()
    .mockRejectedValueOnce(new Error('temporary failure'))
    .mockResolvedValueOnce(
      createGraph(
        '/workspace/eslint.config.js',
        `module.exports = [{ rules: {} }]`,
        'config-graph',
      ),
    )
  const loadEslintModule = jest.fn(async () => eslintGraph)
  const lint = () =>
    EslintEvaluation.lintWithDependencies(
      'const value = 1',
      '/workspace/src/file.js',
      '/workspace/eslint.config.js',
      undefined,
      { loadEslintConfig, loadEslintModule },
    )

  await expect(lint()).rejects.toThrow('temporary failure')
  await expect(lint()).resolves.toEqual([])
  expect(loadEslintConfig).toHaveBeenCalledTimes(2)
})

const resolutionStats = {
  durationMs: 2,
  fileReadCount: 1,
  files: [
    {
      contentLength: 10,
      durationMs: 1,
      path: '/workspace/file.js',
    },
  ],
  totalContentLength: 10,
  uniqueFileCount: 1,
}

test('captures config evaluation and lint timings', async () => {
  const configGraph = createGraph(
    '/workspace/eslint.config.js',
    `module.exports = [{ rules: {} }]`,
    'config-trace-graph',
  )
  const eslintGraph = createGraph(
    '/workspace/node_modules/eslint/index.js',
    `module.exports = { Linter: class { verify() { return [] } } }`,
    'eslint-trace-graph',
  )

  const trace = await EslintEvaluation.traceWithDependencies(
    'const value = 1',
    '/workspace/src/file.js',
    '/workspace/eslint.config.js',
    undefined,
    {
      loadEslintConfig: async () => ({
        graph: configGraph,
        stats: resolutionStats,
      }),
      loadEslintModule: async () => ({
        graph: eslintGraph,
        stats: resolutionStats,
      }),
    },
  )

  expect(trace.error).toBeUndefined()
  expect(trace.configResolution).toEqual(resolutionStats)
  expect(trace.eslintResolution).toEqual(resolutionStats)
  expect(trace.eslintEvaluation?.durationMs).toBeGreaterThanOrEqual(0)
  expect(trace.configEvaluation?.durationMs).toBeGreaterThanOrEqual(0)
  expect(trace.lint?.durationMs).toBeGreaterThanOrEqual(0)
  expect(trace.lint?.diagnosticCount).toBe(0)
})

test('captures config evaluation errors', async () => {
  const configGraph = createGraph(
    '/workspace/eslint.config.js',
    `module.exports = [`,
    'invalid-config-trace-graph',
  )
  const eslintGraph = createGraph(
    '/workspace/node_modules/eslint/index.js',
    `module.exports = { Linter: class { verify() { return [] } } }`,
    'eslint-error-trace-graph',
  )

  const trace = await EslintEvaluation.traceWithDependencies(
    'const value = 1',
    '/workspace/src/file.js',
    '/workspace/eslint.config.js',
    undefined,
    {
      loadEslintConfig: async () => ({
        graph: configGraph,
        stats: resolutionStats,
      }),
      loadEslintModule: async () => ({
        graph: eslintGraph,
        stats: resolutionStats,
      }),
    },
  )

  expect(trace.error?.stage).toBe('configEvaluation')
  expect(trace.error?.details.name).toBe('SyntaxError')
  expect(trace.configEvaluation?.durationMs).toBeGreaterThanOrEqual(0)
  expect(trace.lint).toBeUndefined()
})
