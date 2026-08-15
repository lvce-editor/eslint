import { beforeEach, expect, test } from '@jest/globals'
import * as EslintEvaluationWorker from '../src/parts/EslintEvaluationWorker/EslintEvaluationWorker.ts'

beforeEach(() => {
  EslintEvaluationWorker.state.rpcPromise = undefined
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
