import { closeUri, executeCommand, openUri, writeFile } from '@lvce-editor/api'
import prettyBytes from 'pretty-bytes'
import type { LoadedSuppressions } from '../LoadSuppressions/LoadSuppressions.ts'
import * as EslintEvaluationWorker from '../EslintEvaluationWorker/EslintEvaluationWorker.ts'
import * as FindEslintConfig from '../FindEslintConfig/FindEslintConfig.ts'
import * as LastTextDocument from '../LastTextDocument/LastTextDocument.ts'
import * as LoadSuppressions from '../LoadSuppressions/LoadSuppressions.ts'

export interface TextDocument {
  readonly text: string
  readonly uri: string
}

interface ErrorDetails {
  readonly code?: string | number
  readonly message: string
  readonly name: string
  readonly stack?: string
}

type ResolutionStats = NonNullable<
  EslintEvaluationWorker.EslintPerformanceTrace['configResolution']
> & {
  readonly totalContentSize: string
}

export type PerformanceTrace = Omit<
  EslintEvaluationWorker.EslintPerformanceTrace,
  'configResolution' | 'error' | 'eslintResolution'
> & {
  readonly configResolution?: ResolutionStats
  readonly configDiscovery?: FindEslintConfig.ConfigDiscoveryTrace
  readonly configPath?: string | null
  readonly error?: {
    readonly details: ErrorDetails
    readonly stage:
      | NonNullable<
          EslintEvaluationWorker.EslintPerformanceTrace['error']
        >['stage']
      | 'activeDocument'
      | 'configDiscovery'
      | 'suppressions'
  }
  readonly file: {
    readonly uri?: string
  }
  readonly fresh: true
  readonly generatedAt: string
  readonly schemaVersion: 1
  readonly eslintResolution?: ResolutionStats
  readonly suppressions?: {
    readonly durationMs: number
  }
  readonly totalDurationMs: number
}

interface Dependencies {
  readonly findEslintConfig: (
    filePath: string,
    captureStats: true,
  ) => Promise<FindEslintConfig.ConfigDiscoveryTrace>
  readonly getActiveTextDocument: () => Promise<TextDocument | undefined>
  readonly lint: (
    text: string,
    filePath: string,
    configPath: string | undefined,
    loadedSuppressions: LoadedSuppressions | undefined,
    captureStats: true,
  ) => Promise<EslintEvaluationWorker.EslintPerformanceTrace>
  readonly loadSuppressions: typeof LoadSuppressions.loadSuppressions
  readonly openTrace: (trace: PerformanceTrace) => Promise<void>
}

interface OutputDependencies {
  readonly closeUri: typeof closeUri
  readonly openUri: typeof openUri
  readonly writeFile: typeof writeFile
}

const traceUri = 'memfs://eslint-performance-trace.json'

const roundNumber = (value: number): number => {
  return Math.round(value * 1000) / 1000
}

const stringifyTrace = (trace: PerformanceTrace): string => {
  return JSON.stringify(
    trace,
    (_key, value: unknown) =>
      typeof value === 'number' ? roundNumber(value) : value,
    2,
  )
}

export const openPerformanceTraceWithDependencies = async (
  trace: PerformanceTrace,
  dependencies: OutputDependencies,
): Promise<void> => {
  await dependencies.closeUri(traceUri)
  await dependencies.writeFile(traceUri, stringifyTrace(trace))
  await dependencies.openUri(traceUri)
}

const openTrace = (trace: PerformanceTrace): Promise<void> => {
  return openPerformanceTraceWithDependencies(trace, {
    closeUri,
    openUri,
    writeFile,
  })
}

type ExecuteCommand = (commandId: string) => Promise<unknown>

const isTextDocument = (value: unknown): value is TextDocument => {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as TextDocument).text === 'string' &&
    typeof (value as TextDocument).uri === 'string'
  )
}

const isCommandNotFoundError = (error: unknown): boolean => {
  return (
    error instanceof Error &&
    error.message.includes('GetActiveEditor.getTextDocument') &&
    error.message.includes('not found')
  )
}

export const getActiveTextDocumentWithDependencies = async (
  executeCommand: ExecuteCommand,
  getLastTextDocument: () => TextDocument | undefined,
): Promise<TextDocument | undefined> => {
  try {
    const textDocument = await executeCommand('GetActiveEditor.getTextDocument')
    if (textDocument === undefined || isTextDocument(textDocument)) {
      return textDocument
    }
    throw new TypeError('Invalid active text document')
  } catch (error) {
    if (!isCommandNotFoundError(error)) {
      throw error
    }
    return getLastTextDocument()
  }
}

const getActiveTextDocument = (): Promise<TextDocument | undefined> => {
  return getActiveTextDocumentWithDependencies(
    executeCommand,
    LastTextDocument.get,
  )
}

const defaultDependencies: Dependencies = {
  findEslintConfig: FindEslintConfig.findEslintConfig,
  getActiveTextDocument,
  lint: EslintEvaluationWorker.lint,
  loadSuppressions: LoadSuppressions.loadSuppressions,
  openTrace,
}

const now = (): number => performance.now()

const addTotalContentSize = (
  stats: NonNullable<
    EslintEvaluationWorker.EslintPerformanceTrace['configResolution']
  >,
): ResolutionStats => {
  const { uniqueFileCount, ...rest } = stats
  return {
    ...rest,
    totalContentSize: prettyBytes(stats.totalContentLength),
    uniqueFileCount,
  }
}

const addReadableSizes = (
  trace: EslintEvaluationWorker.EslintPerformanceTrace,
): Omit<
  PerformanceTrace,
  'file' | 'fresh' | 'generatedAt' | 'schemaVersion' | 'totalDurationMs'
> => {
  const { configResolution, eslintResolution, ...rest } = trace
  return {
    ...rest,
    ...(configResolution && {
      configResolution: addTotalContentSize(configResolution),
    }),
    ...(eslintResolution && {
      eslintResolution: addTotalContentSize(eslintResolution),
    }),
  }
}

const toErrorDetails = (error: unknown): ErrorDetails => {
  if (!(error instanceof Error)) {
    return {
      message: String(error),
      name: 'Error',
    }
  }
  const { code } = error as Error & { readonly code?: unknown }
  return {
    ...((typeof code === 'string' || typeof code === 'number') && { code }),
    message: error.message,
    name: error.name,
    ...(error.stack && { stack: error.stack }),
  }
}

const createBaseTrace = (
  textDocument: TextDocument | undefined,
): Omit<PerformanceTrace, 'totalDurationMs'> => ({
  file: {
    ...(textDocument?.uri && { uri: textDocument.uri }),
  },
  fresh: true,
  generatedAt: new Date().toISOString(),
  schemaVersion: 1,
})

export const showPerformanceTraceWithDependencies = async (
  textDocument: TextDocument | undefined,
  dependencies: Dependencies,
): Promise<PerformanceTrace> => {
  const startTime = now()
  let actualTextDocument: TextDocument | undefined
  try {
    actualTextDocument =
      textDocument ?? (await dependencies.getActiveTextDocument())
  } catch (error) {
    const trace: PerformanceTrace = {
      ...createBaseTrace(undefined),
      error: {
        details: toErrorDetails(error),
        stage: 'activeDocument',
      },
      totalDurationMs: now() - startTime,
    }
    await dependencies.openTrace(trace)
    return trace
  }
  const baseTrace = createBaseTrace(actualTextDocument)
  let trace: PerformanceTrace
  if (!actualTextDocument) {
    trace = {
      ...baseTrace,
      error: {
        details: {
          code: 'NO_ACTIVE_DOCUMENT',
          message: 'No active text document is available',
          name: 'Error',
        },
        stage: 'activeDocument',
      },
      totalDurationMs: now() - startTime,
    }
    await dependencies.openTrace(trace)
    return trace
  }

  const { text, uri: filePath } = actualTextDocument
  let configDiscovery: FindEslintConfig.ConfigDiscoveryTrace
  try {
    configDiscovery = await dependencies.findEslintConfig(filePath, true)
  } catch (error) {
    trace = {
      ...baseTrace,
      error: {
        details: toErrorDetails(error),
        stage: 'configDiscovery',
      },
      totalDurationMs: now() - startTime,
    }
    await dependencies.openTrace(trace)
    return trace
  }
  const { configPath } = configDiscovery
  if (!configPath) {
    trace = {
      ...baseTrace,
      configDiscovery,
      configPath,
      error: {
        details: {
          code: 'ESLINT_CONFIG_NOT_FOUND',
          message: `No eslint.config.js was found for ${filePath}`,
          name: 'Error',
        },
        stage: 'configDiscovery',
      },
      totalDurationMs: now() - startTime,
    }
    await dependencies.openTrace(trace)
    return trace
  }

  const suppressionsStart = now()
  let loadedSuppressions: LoadedSuppressions | undefined
  try {
    loadedSuppressions = await dependencies.loadSuppressions(
      filePath,
      configPath,
    )
  } catch (error) {
    trace = {
      ...baseTrace,
      configDiscovery,
      configPath,
      error: {
        details: toErrorDetails(error),
        stage: 'suppressions',
      },
      suppressions: {
        durationMs: now() - suppressionsStart,
      },
      totalDurationMs: now() - startTime,
    }
    await dependencies.openTrace(trace)
    return trace
  }
  const suppressions = {
    durationMs: now() - suppressionsStart,
  }
  let workerTrace: EslintEvaluationWorker.EslintPerformanceTrace
  try {
    workerTrace = await dependencies.lint(
      text,
      filePath,
      configPath,
      loadedSuppressions,
      true,
    )
  } catch (error) {
    trace = {
      ...baseTrace,
      configDiscovery,
      configPath,
      error: {
        details: toErrorDetails(error),
        stage: 'lint',
      },
      suppressions,
      totalDurationMs: now() - startTime,
    }
    await dependencies.openTrace(trace)
    return trace
  }
  trace = {
    ...baseTrace,
    configDiscovery,
    configPath,
    ...addReadableSizes(workerTrace),
    suppressions,
    totalDurationMs: now() - startTime,
  }
  await dependencies.openTrace(trace)
  return trace
}

export const showPerformanceTrace = (
  textDocument?: TextDocument,
): Promise<PerformanceTrace> => {
  return showPerformanceTraceWithDependencies(textDocument, defaultDependencies)
}
