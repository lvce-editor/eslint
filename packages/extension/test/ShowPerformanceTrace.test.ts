import { expect, jest, test } from '@jest/globals'
import * as ShowPerformanceTrace from '../src/parts/ShowPerformanceTrace/ShowPerformanceTrace.ts'

const document = {
  text: 'debugger',
  uri: '/workspace/test.js',
}

const configDiscovery = {
  configPath: '/workspace/eslint.config.js',
  directories: ['/workspace'],
  directoryReadCount: 1,
  durationMs: 1,
}

const resolutionStats = {
  durationMs: 2.345679,
  fileReadCount: 1,
  files: [
    {
      contentLength: 20,
      durationMs: 1.234568,
      path: '/workspace/eslint.config.js',
    },
  ],
  totalContentLength: 20,
  uniqueFileCount: 1,
}

test('uses the last linted document when the active document command is unavailable', async () => {
  const executeCommand = jest.fn(async () => {
    throw new Error(
      'Command "GetActiveEditor.getTextDocument" not found (renderer worker)',
    )
  })

  await expect(
    ShowPerformanceTrace.getActiveTextDocumentWithDependencies(
      executeCommand,
      () => document,
    ),
  ).resolves.toEqual(document)
})

test('does not use a stale document when the active document command reports no editor', async () => {
  await expect(
    ShowPerformanceTrace.getActiveTextDocumentWithDependencies(
      async () => undefined,
      () => document,
    ),
  ).resolves.toBeUndefined()
})

test('preserves unexpected active document errors in the trace', async () => {
  const openTrace = jest.fn<
    (trace: ShowPerformanceTrace.PerformanceTrace) => Promise<void>
  >(async () => {})
  const trace = await ShowPerformanceTrace.showPerformanceTraceWithDependencies(
    undefined,
    {
      findEslintConfig: async () => configDiscovery,
      getActiveTextDocument: async () => {
        throw new Error('active editor failed')
      },
      lint: async () => ({}),
      loadSuppressions: async () => undefined,
      openTrace,
    },
  )

  expect(trace.error).toMatchObject({
    details: { message: 'active editor failed' },
    stage: 'activeDocument',
  })
  expect(openTrace).toHaveBeenCalledWith(trace)
})

test('resolves the active document and opens a successful performance trace', async () => {
  const openTrace = jest.fn<
    (trace: ShowPerformanceTrace.PerformanceTrace) => Promise<void>
  >(async () => {})
  const trace = await ShowPerformanceTrace.showPerformanceTraceWithDependencies(
    undefined,
    {
      findEslintConfig: async () => configDiscovery,
      getActiveTextDocument: async () => document,
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
      openTrace,
    },
  )

  expect(trace.error).toBeUndefined()
  expect(trace.fresh).toBe(true)
  expect(trace.file.uri).toBe('file:///workspace/test.js')
  expect(trace.configPath).toBe('file:///workspace/eslint.config.js')
  expect(trace.configDiscovery).toEqual({
    ...configDiscovery,
    configPath: 'file:///workspace/eslint.config.js',
    directories: ['file:///workspace'],
  })
  expect(trace.configResolution?.fileReadCount).toBe(1)
  expect(trace.configResolution?.durationMs).toBeCloseTo(2.346)
  expect(trace.configResolution?.files[0].durationMs).toBeCloseTo(1.235)
  expect(trace.configResolution?.totalContentSize).toBe('20 B')
  expect(trace.eslintResolution?.totalContentSize).toBe('20 B')
  expect(trace.configResolution?.files[0].path).toBe(
    'file:///workspace/eslint.config.js',
  )
  expect(trace.eslintResolution?.files[0].path).toBe(
    'file:///workspace/eslint.config.js',
  )
  expect(trace.lint?.durationMs).toBe(5)
  expect(openTrace).toHaveBeenCalledWith(trace)
})

test('preserves file system provider schemes in performance trace uris', async () => {
  const providerDocument = {
    text: 'debugger',
    uri: 'test-provider://workspace/test.js',
  }
  const providerConfigDiscovery = {
    ...configDiscovery,
    configPath: 'test-provider://workspace/eslint.config.js',
    directories: ['test-provider://workspace'],
  }
  const providerResolutionStats = {
    ...resolutionStats,
    files: [
      {
        ...resolutionStats.files[0],
        path: 'test-provider://workspace/eslint.config.js',
      },
    ],
  }
  const trace = await ShowPerformanceTrace.showPerformanceTraceWithDependencies(
    providerDocument,
    {
      findEslintConfig: async () => providerConfigDiscovery,
      getActiveTextDocument: async () => undefined,
      lint: async () => ({
        configResolution: providerResolutionStats,
        eslintResolution: providerResolutionStats,
      }),
      loadSuppressions: async () => undefined,
      openTrace: async () => {},
    },
  )

  expect(trace.file.uri).toBe(providerDocument.uri)
  expect(trace.configPath).toBe(providerConfigDiscovery.configPath)
  expect(trace.configDiscovery?.directories).toEqual(
    providerConfigDiscovery.directories,
  )
  expect(trace.configResolution?.files[0].path).toBe(
    providerResolutionStats.files[0].path,
  )
  expect(trace.eslintResolution?.files[0].path).toBe(
    providerResolutionStats.files[0].path,
  )
})

test('opens a trace error when no config is found', async () => {
  const openTrace = jest.fn<
    (trace: ShowPerformanceTrace.PerformanceTrace) => Promise<void>
  >(async () => {})
  const lint = jest.fn(async () => ({}))
  const trace = await ShowPerformanceTrace.showPerformanceTraceWithDependencies(
    document,
    {
      findEslintConfig: async () => ({
        ...configDiscovery,
        configPath: null,
      }),
      getActiveTextDocument: async () => undefined,
      lint,
      loadSuppressions: async () => undefined,
      openTrace,
    },
  )

  expect(trace.error).toMatchObject({
    details: {
      code: 'ESLINT_CONFIG_NOT_FOUND',
      message: 'No eslint.config.js was found for file:///workspace/test.js',
    },
    stage: 'configDiscovery',
  })
  expect(trace.configDiscovery?.directories).toEqual(['file:///workspace'])
  expect(lint).not.toHaveBeenCalled()
  expect(openTrace).toHaveBeenCalledWith(trace)
})

test('preserves config evaluation errors in the opened trace', async () => {
  const openTrace = jest.fn<
    (trace: ShowPerformanceTrace.PerformanceTrace) => Promise<void>
  >(async () => {})
  const trace = await ShowPerformanceTrace.showPerformanceTraceWithDependencies(
    document,
    {
      findEslintConfig: async () => configDiscovery,
      getActiveTextDocument: async () => undefined,
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
      openTrace,
    },
  )

  expect(trace.error).toEqual({
    details: {
      message: 'Unexpected token',
      name: 'SyntaxError',
    },
    stage: 'configEvaluation',
  })
  expect(openTrace).toHaveBeenCalledWith(trace)
})

test('writes a pretty-printed json trace to a named file', async () => {
  const closeUri = jest.fn<(uri: string) => Promise<void>>(async () => {})
  const openUri = jest.fn<(uri: string) => Promise<void>>(async () => {})
  const writeFile = jest.fn<(uri: string, content: string) => Promise<void>>(
    async () => {},
  )
  const trace = {
    configDiscovery: {
      configPath: '/workspace/eslint.config.js',
      directories: ['/workspace'],
      directoryReadCount: 1,
      durationMs: 2.345679,
    },
    file: { uri: 'file:///workspace/test.js' },
    fresh: true,
    generatedAt: '2026-08-21T00:00:00.000Z',
    schemaVersion: 1,
    totalDurationMs: 1.234568,
  } as const

  await ShowPerformanceTrace.openPerformanceTraceWithDependencies(trace, {
    closeUri,
    openUri,
    writeFile,
  })

  const uri = 'memfs://eslint-performance-trace.json'
  expect(closeUri).toHaveBeenCalledWith(uri)
  expect(writeFile).toHaveBeenCalledWith(
    uri,
    JSON.stringify(
      {
        ...trace,
        configDiscovery: {
          ...trace.configDiscovery,
          durationMs: 2.346,
        },
        totalDurationMs: 1.235,
      },
      null,
      2,
    ),
  )
  expect(openUri).toHaveBeenCalledWith(uri)
})
