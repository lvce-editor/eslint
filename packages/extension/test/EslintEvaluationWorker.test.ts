import { beforeEach, expect, jest, test } from '@jest/globals'
import * as EslintEvaluationWorker from '../src/parts/EslintEvaluationWorker/EslintEvaluationWorker.ts'
import * as ModuleGraphDependencies from '../src/parts/ModuleGraphDependencies/ModuleGraphDependencies.ts'
import * as ModuleResolutionWorker from '../src/parts/ModuleResolutionWorker/ModuleResolutionWorker.ts'

beforeEach(() => {
  EslintEvaluationWorker.state.rpcPromise = undefined
  ModuleResolutionWorker.state.activeSessions = 0
  ModuleResolutionWorker.state.disposePromise = undefined
  ModuleResolutionWorker.state.invalidatedCacheKeys.clear()
  ModuleResolutionWorker.state.rpcPromise = undefined
  ModuleGraphDependencies.clear()
})

test('runs linting in the eslint evaluation worker', async () => {
  const invocations: unknown[] = []
  let workerId = ''
  EslintEvaluationWorker.state.createRpc = async (options) => {
    const workerOptions = options as { id: string }
    workerId = workerOptions.id
    return {
      invoke: async (method, ...params) => {
        invocations.push([method, ...params])
        return []
      },
    }
  }

  await expect(
    EslintEvaluationWorker.lint(
      'const value = 1',
      '/workspace/src/file.js',
      '/workspace/eslint.config.js',
    ),
  ).resolves.toEqual([])
  expect(workerId).toBe('builtin.eslint.evaluation-worker')
  expect(invocations).toEqual([
    [
      'EslintEvaluation.lint',
      'const value = 1',
      '/workspace/src/file.js',
      '/workspace/eslint.config.js',
      undefined,
    ],
  ])
})

test('clears evaluated module caches in the evaluation worker', async () => {
  const invocations: unknown[] = []
  EslintEvaluationWorker.state.createRpc = async () => ({
    invoke: async (method, ...params) => {
      invocations.push([method, ...params])
    },
  })

  await EslintEvaluationWorker.clearCache()

  expect(invocations).toEqual([['EslintEvaluation.clearCache']])
})

test('disposes the module resolution worker after linting', async () => {
  const dispose = jest.fn<() => void>()
  const graph = {
    entry: '/workspace/eslint.config.js',
    files: {},
    id: 'graph',
    modules: { '/workspace/eslint.config.js': '' },
    resolutions: {},
  }
  ModuleResolutionWorker.state.createRpc = async () => ({
    dispose,
    invoke: async () => graph,
  })
  EslintEvaluationWorker.state.createRpc = async () => ({
    invoke: async () => {
      await ModuleResolutionWorker.loadEslintConfig(
        'file:///workspace/eslint.config.js',
        'file:///workspace/src/file.js',
      )
      return []
    },
  })

  await EslintEvaluationWorker.lint(
    'const value = 1',
    'file:///workspace/src/file.js',
    'file:///workspace/eslint.config.js',
  )

  expect(dispose).toHaveBeenCalledTimes(1)
})

test('disposes the module resolution worker when linting fails', async () => {
  const dispose = jest.fn<() => void>()
  const graph = {
    entry: '/workspace/eslint.config.js',
    files: {},
    id: 'graph',
    modules: { '/workspace/eslint.config.js': '' },
    resolutions: {},
  }
  ModuleResolutionWorker.state.createRpc = async () => ({
    dispose,
    invoke: async () => graph,
  })
  EslintEvaluationWorker.state.createRpc = async () => ({
    invoke: async () => {
      await ModuleResolutionWorker.loadEslintConfig(
        'file:///workspace/eslint.config.js',
      )
      throw new Error('lint failed')
    },
  })

  await expect(
    EslintEvaluationWorker.lint(
      'const value = 1',
      'file:///workspace/src/file.js',
    ),
  ).rejects.toThrow('lint failed')
  expect(dispose).toHaveBeenCalledTimes(1)
})
