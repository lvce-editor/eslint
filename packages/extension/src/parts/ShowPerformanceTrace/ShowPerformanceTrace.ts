import { openUri } from '@lvce-editor/api'
import type { LoadedSuppressions } from '../LoadSuppressions/LoadSuppressions.ts'
import * as EslintEvaluationWorker from '../EslintEvaluationWorker/EslintEvaluationWorker.ts'
import * as FindEslintConfig from '../FindEslintConfig/FindEslintConfig.ts'
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

export type PerformanceTrace = Omit<
  EslintEvaluationWorker.EslintPerformanceTrace,
  'error'
> & {
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
  readonly lint: (
    text: string,
    filePath: string,
    configPath: string | undefined,
    loadedSuppressions: LoadedSuppressions | undefined,
    captureStats: true,
  ) => Promise<EslintEvaluationWorker.EslintPerformanceTrace>
  readonly loadSuppressions: typeof LoadSuppressions.loadSuppressions
  readonly openUri: (uri: string) => Promise<void>
}

const defaultDependencies: Dependencies = {
  findEslintConfig: FindEslintConfig.findEslintConfig,
  lint: EslintEvaluationWorker.lint,
  loadSuppressions: LoadSuppressions.loadSuppressions,
  openUri,
}

const now = (): number => performance.now()

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

const toDataUri = (trace: PerformanceTrace): string => {
  const json = JSON.stringify(trace)
  return `data://${json}`
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
  const baseTrace = createBaseTrace(textDocument)
  let trace: PerformanceTrace
  if (!textDocument) {
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
    await dependencies.openUri(toDataUri(trace))
    return trace
  }

  const { text, uri: filePath } = textDocument
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
    await dependencies.openUri(toDataUri(trace))
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
    await dependencies.openUri(toDataUri(trace))
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
    await dependencies.openUri(toDataUri(trace))
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
    await dependencies.openUri(toDataUri(trace))
    return trace
  }
  trace = {
    ...baseTrace,
    configDiscovery,
    configPath,
    ...workerTrace,
    suppressions,
    totalDurationMs: now() - startTime,
  }
  await dependencies.openUri(toDataUri(trace))
  return trace
}

export const showPerformanceTrace = (
  textDocument?: TextDocument,
): Promise<PerformanceTrace> => {
  return showPerformanceTraceWithDependencies(textDocument, defaultDependencies)
}
