import { beforeEach, expect, test } from '@jest/globals'
import * as EslintEvaluationWorker from '../src/parts/EslintEvaluationWorker/EslintEvaluationWorker.ts'

beforeEach(() => {
  EslintEvaluationWorker.state.rpcPromise = undefined
})

test('runs linting in the eslint evaluation worker', async () => {
  const invocations: unknown[] = []
  let workerName = ''
  let workerUrl = ''
  EslintEvaluationWorker.state.createRpc = async (options) => {
    const workerOptions = options as { name: string; url: string }
    workerName = workerOptions.name
    workerUrl = workerOptions.url
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
  expect(workerName).toBe('ESLint Evaluation Worker')
  expect(workerUrl).toContain('eslintEvaluationWorkerMain.js')
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
