import type { LoadedSuppressions } from '../ApplySuppressions/ApplySuppressions.ts'
import type { LintResult } from '../Lint/Lint.ts'
import type { ModuleGraph } from '../ModuleGraph/ModuleGraph.ts'
import * as Lint from '../Lint/Lint.ts'
import * as LoadEslint from '../LoadEslint/LoadEslint.ts'
import * as ModuleResolution from '../ModuleResolution/ModuleResolution.ts'

interface Dependencies {
  readonly loadEslintConfig: (
    path: string,
    filePath: string,
  ) => Promise<ModuleGraph>
  readonly loadEslintModule: (
    path: string,
    projectPath?: string,
  ) => Promise<ModuleGraph>
}

const defaultDependencies: Dependencies = {
  loadEslintConfig: ModuleResolution.loadEslintConfig,
  loadEslintModule: ModuleResolution.loadEslintModule,
}

interface TraceDependencies {
  readonly loadEslintConfig: (
    path: string,
    filePath: string,
    captureStats: true,
  ) => Promise<ModuleResolution.ModuleResolutionTrace>
  readonly loadEslintModule: (
    path: string,
    projectPath: string | undefined,
    captureStats: true,
  ) => Promise<ModuleResolution.ModuleResolutionTrace>
}

const defaultTraceDependencies: TraceDependencies = {
  loadEslintConfig: ModuleResolution.loadEslintConfig,
  loadEslintModule: ModuleResolution.loadEslintModule,
}

export interface EslintPerformanceTrace {
  readonly configEvaluation?: Lint.LintPerformanceTrace['configEvaluation']
  readonly configResolution?: ModuleResolution.ResolutionStats
  readonly error?: {
    readonly details: ModuleResolution.ErrorDetails
    readonly stage:
      | 'configEvaluation'
      | 'configResolution'
      | 'eslintEvaluation'
      | 'eslintResolution'
      | 'lint'
  }
  readonly eslintEvaluation?: {
    readonly durationMs: number
  }
  readonly eslintResolution?: ModuleResolution.ResolutionStats
  readonly lint?: NonNullable<Lint.LintPerformanceTrace['lint']>
}

const now = (): number => performance.now()

const toErrorDetails = (error: unknown): ModuleResolution.ErrorDetails => {
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

const configGraphs = new Map<string, Promise<ModuleGraph>>()
const eslintGraphs = new Map<string, Promise<ModuleGraph>>()

const getOrLoadGraph = (
  cache: Map<string, Promise<ModuleGraph>>,
  key: string,
  load: () => Promise<ModuleGraph>,
): Promise<ModuleGraph> => {
  let graph = cache.get(key)
  if (!graph) {
    graph = load()
    cache.set(key, graph)
    void graph.catch(() => {
      if (cache.get(key) === graph) {
        cache.delete(key)
      }
    })
  }
  return graph
}

export const clearCache = (): void => {
  configGraphs.clear()
  eslintGraphs.clear()
  Lint.clearCache()
  LoadEslint.clearCache()
}

export const lintWithDependencies = async (
  text: string,
  filePath: string,
  configPath: string | undefined,
  loadedSuppressions: LoadedSuppressions | undefined,
  dependencies: Dependencies,
): Promise<LintResult[]> => {
  const configGraph = configPath
    ? await getOrLoadGraph(configGraphs, `${configPath}\0${filePath}`, () =>
        dependencies.loadEslintConfig(configPath, filePath),
      )
    : undefined
  const eslintGraphKey = configPath ?? filePath
  const eslintGraph = await getOrLoadGraph(eslintGraphs, eslintGraphKey, () =>
    dependencies.loadEslintModule(filePath, configPath),
  )
  const eslint = LoadEslint.loadEslint(eslintGraph)
  return Lint.lint(text, filePath, configGraph, eslint, loadedSuppressions)
}

export const traceWithDependencies = async (
  text: string,
  filePath: string,
  configPath: string | undefined,
  loadedSuppressions: LoadedSuppressions | undefined,
  dependencies: TraceDependencies,
): Promise<EslintPerformanceTrace> => {
  clearCache()
  let configGraph: ModuleGraph | undefined
  let configResolution: ModuleResolution.ResolutionStats | undefined
  if (configPath) {
    const resolution = await dependencies.loadEslintConfig(
      configPath,
      filePath,
      true,
    )
    configResolution = resolution.stats
    if (resolution.error || !resolution.graph) {
      return {
        configResolution,
        error: {
          details:
            resolution.error ??
            toErrorDetails(new Error('ESLint config resolution failed')),
          stage: 'configResolution',
        },
      }
    }
    configGraph = resolution.graph
  }
  const eslintResolutionResult = await dependencies.loadEslintModule(
    filePath,
    configPath,
    true,
  )
  const eslintResolution = eslintResolutionResult.stats
  if (eslintResolutionResult.error || !eslintResolutionResult.graph) {
    return {
      configResolution,
      error: {
        details:
          eslintResolutionResult.error ??
          toErrorDetails(new Error('ESLint module resolution failed')),
        stage: 'eslintResolution',
      },
      eslintResolution,
    }
  }
  const eslintEvaluationStart = now()
  let eslint
  try {
    eslint = LoadEslint.loadEslint(eslintResolutionResult.graph)
  } catch (error) {
    return {
      configResolution,
      error: {
        details: toErrorDetails(error),
        stage: 'eslintEvaluation',
      },
      eslintEvaluation: {
        durationMs: now() - eslintEvaluationStart,
      },
      eslintResolution,
    }
  }
  const eslintEvaluation = {
    durationMs: now() - eslintEvaluationStart,
  }
  const lintTrace = await Lint.lintWithStats(
    text,
    filePath,
    configGraph,
    eslint,
    loadedSuppressions,
  )
  return {
    configEvaluation: lintTrace.configEvaluation,
    configResolution,
    ...(lintTrace.error && { error: lintTrace.error }),
    eslintEvaluation,
    eslintResolution,
    ...(lintTrace.lint && { lint: lintTrace.lint }),
  }
}

export function lint(
  text: string,
  filePath: string,
  configPath: string | undefined,
  loadedSuppressions: LoadedSuppressions | undefined,
  captureStats: true,
): Promise<EslintPerformanceTrace>
export function lint(
  text: string,
  filePath: string,
  configPath?: string,
  loadedSuppressions?: LoadedSuppressions,
  captureStats?: false,
): Promise<LintResult[]>
export function lint(
  text: string,
  filePath: string,
  configPath?: string,
  loadedSuppressions?: LoadedSuppressions,
  captureStats = false,
): Promise<LintResult[] | EslintPerformanceTrace> {
  // captureStats intentionally preserves the default lint API while opting into
  // the larger trace result only for the performance command.
  // eslint-disable-next-line sonarjs/no-selector-parameter
  return captureStats
    ? traceWithDependencies(
        text,
        filePath,
        configPath,
        loadedSuppressions,
        defaultTraceDependencies,
      )
    : lintWithDependencies(
        text,
        filePath,
        configPath,
        loadedSuppressions,
        defaultDependencies,
      )
}
