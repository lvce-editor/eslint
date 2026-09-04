import type { LoadedSuppressions } from '../ApplySuppressions/ApplySuppressions.ts'
import type { LintResult } from '../Lint/Lint.ts'
import type { ModuleGraph } from '../ModuleGraph/ModuleGraph.ts'
import * as Lint from '../Lint/Lint.ts'
import * as LoadEslint from '../LoadEslint/LoadEslint.ts'
import * as ModuleResolution from '../ModuleResolution/ModuleResolution.ts'
import * as ModuleRuntime from '../ModuleRuntime/ModuleRuntime.ts'

interface Dependencies {
  readonly loadEslintConfig: (
    path: string,
    filePath: string,
  ) => Promise<ModuleGraph>
  readonly loadEslintModule: (
    path: string,
    projectPath?: string,
  ) => Promise<ModuleGraph>
  readonly reloadEslintConfig?: (
    path: string,
    filePath: string,
  ) => Promise<ModuleGraph>
  readonly reloadEslintModule?: (
    path: string,
    projectPath?: string,
  ) => Promise<ModuleGraph>
}

const defaultDependencies: Dependencies = {
  loadEslintConfig: ModuleResolution.loadEslintConfig,
  loadEslintModule: ModuleResolution.loadEslintModule,
  reloadEslintConfig: ModuleResolution.reloadEslintConfig,
  reloadEslintModule: ModuleResolution.reloadEslintModule,
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

interface EvaluationCache {
  readonly pending: Map<string, Promise<ModuleRuntime.EvaluatedModuleGraph>>
  readonly results: Map<string, ModuleRuntime.EvaluatedModuleGraph>
}

interface ProjectRuntime {
  readonly configs: EvaluationCache
  readonly eslint: EvaluationCache
  readonly runtime: ModuleRuntime.ModuleRuntime
}

const projects = new Map<string, ProjectRuntime>()

const createEvaluationCache = (): EvaluationCache => ({
  pending: new Map(),
  results: new Map(),
})

const createProjectRuntime = (): ProjectRuntime => ({
  configs: createEvaluationCache(),
  eslint: createEvaluationCache(),
  runtime: ModuleRuntime.createModuleRuntime(),
})

const getProjectRuntime = (key: string): ProjectRuntime => {
  let project = projects.get(key)
  if (!project) {
    project = createProjectRuntime()
    projects.set(key, project)
  }
  return project
}

const getOrEvaluate = async (
  cache: EvaluationCache,
  key: string,
  load: () => Promise<ModuleGraph>,
  runtime: ModuleRuntime.ModuleRuntime,
): Promise<ModuleRuntime.EvaluatedModuleGraph> => {
  const result = cache.results.get(key)
  if (result) {
    return result
  }
  let pending = cache.pending.get(key)
  if (pending) {
    return pending
  }
  pending = (async () => runtime.evaluate(await load()))()
  cache.pending.set(key, pending)
  try {
    const evaluated = await pending
    if (cache.pending.get(key) === pending) {
      cache.results.set(key, evaluated)
    }
    return evaluated
  } finally {
    if (cache.pending.get(key) === pending) {
      cache.pending.delete(key)
    }
  }
}

export const clearCache = (): void => {
  projects.clear()
  Lint.clearCache()
}

const lintWithDependenciesAttempt = async (
  text: string,
  filePath: string,
  configPath: string | undefined,
  loadedSuppressions: LoadedSuppressions | undefined,
  dependencies: Dependencies,
  fresh: boolean,
): Promise<LintResult[]> => {
  const projectKey = configPath ?? filePath.slice(0, filePath.lastIndexOf('/'))
  const project = getProjectRuntime(projectKey)
  const configGraph = configPath
    ? await getOrEvaluate(
        project.configs,
        filePath,
        () =>
          fresh && dependencies.reloadEslintConfig
            ? dependencies.reloadEslintConfig(configPath, filePath)
            : dependencies.loadEslintConfig(configPath, filePath),
        project.runtime,
      )
    : undefined
  const eslintGraph = await getOrEvaluate(
    project.eslint,
    'eslint',
    () =>
      fresh && dependencies.reloadEslintModule
        ? dependencies.reloadEslintModule(filePath, configPath)
        : dependencies.loadEslintModule(filePath, configPath),
    project.runtime,
  )
  const eslint = LoadEslint.loadEslint(eslintGraph)
  return Lint.lint(text, filePath, configGraph, eslint, loadedSuppressions)
}

export const lintWithDependencies = async (
  text: string,
  filePath: string,
  configPath: string | undefined,
  loadedSuppressions: LoadedSuppressions | undefined,
  dependencies: Dependencies,
): Promise<LintResult[]> => {
  try {
    return await lintWithDependenciesAttempt(
      text,
      filePath,
      configPath,
      loadedSuppressions,
      dependencies,
      false,
    )
  } catch (error) {
    if (!(error instanceof ModuleRuntime.ModuleRuntimeConflictError)) {
      throw error
    }
    const projectKey =
      configPath ?? filePath.slice(0, filePath.lastIndexOf('/'))
    projects.delete(projectKey)
    Lint.clearCache()
    return lintWithDependenciesAttempt(
      text,
      filePath,
      configPath,
      loadedSuppressions,
      dependencies,
      true,
    )
  }
}

export const traceWithDependencies = async (
  text: string,
  filePath: string,
  configPath: string | undefined,
  loadedSuppressions: LoadedSuppressions | undefined,
  dependencies: TraceDependencies,
): Promise<EslintPerformanceTrace> => {
  clearCache()
  const runtime = ModuleRuntime.createModuleRuntime()
  let configGraph: ModuleRuntime.EvaluatedModuleGraph | undefined
  let configModuleEvaluationDuration = 0
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
    const configEvaluationStart = now()
    try {
      configGraph = runtime.evaluate(resolution.graph)
      configModuleEvaluationDuration = now() - configEvaluationStart
    } catch (error) {
      return {
        configEvaluation: {
          durationMs: now() - configEvaluationStart,
        },
        configResolution,
        error: {
          details: toErrorDetails(error),
          stage: 'configEvaluation',
        },
      }
    }
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
    const evaluatedEslint = runtime.evaluate(eslintResolutionResult.graph)
    eslint = LoadEslint.loadEslint(evaluatedEslint)
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
    configEvaluation: {
      durationMs:
        configModuleEvaluationDuration + lintTrace.configEvaluation.durationMs,
    },
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
