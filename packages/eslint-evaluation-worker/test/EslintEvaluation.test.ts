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
