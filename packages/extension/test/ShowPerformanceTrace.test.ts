import { expect, jest, test } from '@jest/globals'
import * as ShowPerformanceTrace from '../src/parts/ShowPerformanceTrace/ShowPerformanceTrace.ts'

const document = {
  text: 'debugger',
  uri: 'file:///workspace/test.js',
}

const configDiscovery = {
  configPath: '/workspace/eslint.config.js',
  directories: ['/workspace'],
  directoryReadCount: 1,
  durationMs: 1,
}

const resolutionStats = {
  durationMs: 2,
  fileReadCount: 1,
  files: [
    {
      contentLength: 20,
      durationMs: 1,
      path: '/workspace/eslint.config.js',
    },
  ],
  totalContentLength: 20,
  uniqueFileCount: 1,
}

const parseDataUri = (uri: string): unknown => {
  return JSON.parse(uri.slice('data://'.length))
}

test('opens a successful performance trace as json data', async () => {
  const openUri = jest.fn<(uri: string) => Promise<void>>(async () => {})
  const trace = await ShowPerformanceTrace.showPerformanceTraceWithDependencies(
    document,
    {
      findEslintConfig: async () => configDiscovery,
      lint: async () => ({
        configEvaluation: { durationMs: 3 },
        configResolution: resolutionStats,
        eslintEvaluation: { durationMs: 4 },
        eslintResolution: resolutionStats,
        lint: {
          diagnosticCount: 0,
          diagnostics: [],
          durationMs: 5,
        },
      }),
      loadSuppressions: async () => undefined,
      openUri,
    },
  )

  expect(trace.error).toBeUndefined()
  expect(trace.fresh).toBe(true)
  expect(trace.configResolution?.fileReadCount).toBe(1)
  expect(trace.lint?.durationMs).toBe(5)
  expect(openUri).toHaveBeenCalledTimes(1)
  expect(parseDataUri(openUri.mock.calls[0][0])).toEqual(trace)
})

test('opens a trace error when no config is found', async () => {
  const openUri = jest.fn<(uri: string) => Promise<void>>(async () => {})
  const lint = jest.fn(async () => ({}))
  const trace = await ShowPerformanceTrace.showPerformanceTraceWithDependencies(
    document,
    {
      findEslintConfig: async () => ({
        ...configDiscovery,
        configPath: null,
      }),
      lint,
      loadSuppressions: async () => undefined,
      openUri,
    },
  )

  expect(trace.error).toMatchObject({
    details: { code: 'ESLINT_CONFIG_NOT_FOUND' },
    stage: 'configDiscovery',
  })
  expect(lint).not.toHaveBeenCalled()
  expect(parseDataUri(openUri.mock.calls[0][0])).toEqual(trace)
})

test('preserves config evaluation errors in the opened trace', async () => {
  const openUri = jest.fn<(uri: string) => Promise<void>>(async () => {})
  const trace = await ShowPerformanceTrace.showPerformanceTraceWithDependencies(
    document,
    {
      findEslintConfig: async () => configDiscovery,
      lint: async () => ({
        configEvaluation: { durationMs: 3 },
        configResolution: resolutionStats,
        error: {
          details: {
            message: 'Unexpected token',
            name: 'SyntaxError',
          },
          stage: 'configEvaluation',
        },
        eslintEvaluation: { durationMs: 4 },
        eslintResolution: resolutionStats,
      }),
      loadSuppressions: async () => undefined,
      openUri,
    },
  )

  expect(trace.error).toEqual({
    details: {
      message: 'Unexpected token',
      name: 'SyntaxError',
    },
    stage: 'configEvaluation',
  })
  expect(parseDataUri(openUri.mock.calls[0][0])).toEqual(trace)
})
